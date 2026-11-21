import { Router } from "express";
import type { Types } from "mongoose";
import { z } from "zod";
import { getNativeDb } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { pageQuery, paginate } from "../../lib/pagination.js";
import { countsByKey, monthsAgoStart, recentMonths } from "../../lib/stats.js";
import { escapeRegex, isObjectIdString } from "../../lib/validators.js";
import { authUser, verifyAdmin, verifyToken } from "../../middleware/auth.js";
import { BOOKING_STATUSES, BookingModel } from "../bookings/bookings.model.js";
import { listBookings } from "../bookings/bookings.routes.js";
import { PaymentModel } from "../payments/payments.model.js";
import { listPayments } from "../payments/payments.routes.js";
import { APPROVAL_STATUSES, ServiceModel } from "../services/services.model.js";
import type { ServiceDoc } from "../services/services.routes.js";
import { USER_ROLES, USER_STATUSES, UserModel } from "../users/users.model.js";

export const adminRouter = Router();
adminRouter.use(verifyToken, verifyAdmin);

const STATS_MONTHS = 6;

// GET /api/admin/stats — overview cards and chart data; real counts from the database.
adminRouter.get("/stats", async (_req, res) => {
  const [roles, services, bookings, revenue, monthly] = await Promise.all([
    UserModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    ServiceModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$approvalStatus", count: { $sum: 1 } } }]),
    BookingModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    PaymentModel.aggregate<{ total: number; count: number }>([{ $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }]),
    PaymentModel.aggregate<{ _id: string; total: number }>([
      { $match: { paidAt: { $gte: monthsAgoStart(STATS_MONTHS) } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$paidAt" } }, total: { $sum: "$amount" } } },
    ]),
  ]);

  const usersByRole = countsByKey(USER_ROLES, roles);
  const servicesByStatus = countsByKey(APPROVAL_STATUSES, services);
  const monthlyTotals = new Map(monthly.map((row) => [row._id, row.total]));
  const round = (value: number) => Math.round(value * 100) / 100;

  res.json({
    success: true,
    data: {
      totalUsers: Object.values(usersByRole).reduce((sum, count) => sum + count, 0),
      totalTechnicians: usersByRole.technician,
      pendingServices: servicesByStatus.pending,
      totalRevenue: round(revenue[0]?.total ?? 0),
      totalPayments: revenue[0]?.count ?? 0,
      usersByRole,
      servicesByStatus,
      bookingsByStatus: countsByKey(BOOKING_STATUSES, bookings),
      revenueByMonth: recentMonths(STATS_MONTHS).map((month) => ({ month, revenue: round(monthlyTotals.get(month) ?? 0) })),
    },
  });
});

// --- users ---

const listUsersQuery = z.object({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  search: z.string().trim().max(100).optional(),
  ...pageQuery,
});

const USER_ROW_FIELDS = "name email image role status createdAt";
type UserRow = { _id: Types.ObjectId; name: string; email: string; image?: string | null; role: string; status: string; createdAt: Date };

// GET /api/admin/users — every user: photo, name, email, role, joined date.
adminRouter.get("/users", async (req, res) => {
  const query = listUsersQuery.parse(req.query);
  const search = query.search ? new RegExp(escapeRegex(query.search), "i") : undefined;
  const filter = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(search ? { $or: [{ name: search }, { email: search }] } : {}),
  };
  const total = await UserModel.countDocuments(filter);
  const { page, pageCount, skip } = paginate(total, query.page, query.limit);
  const items = await UserModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(query.limit).select(USER_ROW_FIELDS).lean<UserRow[]>();
  res.json({ success: true, data: { items, page, limit: query.limit, total, pageCount } });
});

/** 403 when an admin targets their own account: they can't change their own role or status. */
function targetUserId(req: Parameters<typeof authUser>[0], action: string) {
  const id = req.params.id;
  if (!isObjectIdString(id)) throw new AppError(404, "NOT_FOUND", "User not found");
  if (id === authUser(req).id) throw new AppError(403, "FORBIDDEN", `You can't change your own ${action}`);
  return id;
}

const roleBody = z.strictObject({ role: z.enum(USER_ROLES) });

// PATCH /api/admin/users/:id/role — make a user a customer, technician or admin. Takes effect on their next request.
adminRouter.patch("/users/:id/role", async (req, res) => {
  const id = targetUserId(req, "role");
  const { role } = roleBody.parse(req.body);
  const user = await UserModel.findByIdAndUpdate(id, { $set: { role } }, { returnDocument: "after" }).select(USER_ROW_FIELDS).lean<UserRow>();
  if (!user) throw new AppError(404, "NOT_FOUND", "User not found");
  res.json({ success: true, data: user });
});

const statusBody = z.strictObject({ status: z.enum(USER_STATUSES) });

// PATCH /api/admin/users/:id/status — suspend or reactivate a non-admin account.
adminRouter.patch("/users/:id/status", async (req, res) => {
  const id = targetUserId(req, "account status");
  const { status } = statusBody.parse(req.body);
  const user = await UserModel.findOneAndUpdate({ _id: id, role: { $ne: "admin" } }, { $set: { status } }, { returnDocument: "after" })
    .select(USER_ROW_FIELDS)
    .lean<UserRow>();
  if (!user) throw new AppError(404, "NOT_FOUND", "User not found, or it's an admin account");

  // Suspension also signs the user out everywhere; verifyToken already rejects their API tokens.
  if (status === "suspended") await getNativeDb().collection("session").deleteMany({ userId: user._id });
  res.json({ success: true, data: user });
});

// --- services ---

const listServicesQuery = z.object({ approvalStatus: z.enum(APPROVAL_STATUSES).optional(), ...pageQuery });

// GET /api/admin/services — services from all technicians, pending first.
adminRouter.get("/services", async (req, res) => {
  const query = listServicesQuery.parse(req.query);
  const filter = query.approvalStatus ? { approvalStatus: query.approvalStatus } : {};
  const total = await ServiceModel.countDocuments(filter);
  const { page, pageCount, skip } = paginate(total, query.page, query.limit);
  // Pending services come first so they are easy to find, then the rest by latest change.
  const items = await ServiceModel.aggregate<ServiceDoc>([
    { $match: filter },
    { $addFields: { pendingFirst: { $cond: [{ $eq: ["$approvalStatus", "pending"] }, 0, 1] } } },
    { $sort: { pendingFirst: 1, updatedAt: -1, _id: -1 } },
    { $skip: skip },
    { $limit: query.limit },
    { $project: { pendingFirst: 0 } },
  ]);
  res.json({ success: true, data: { items, page, limit: query.limit, total, pageCount } });
});

const approvalBody = z.strictObject({ approvalStatus: z.enum(["approved", "rejected"]) });

// PATCH /api/admin/services/:id/approval — approve or reject any service.
adminRouter.patch("/services/:id/approval", async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw new AppError(404, "NOT_FOUND", "Service not found");
  const { approvalStatus } = approvalBody.parse(req.body);
  const service = await ServiceModel.findByIdAndUpdate(req.params.id, { $set: { approvalStatus } }, { returnDocument: "after" }).lean<ServiceDoc>();
  if (!service) throw new AppError(404, "NOT_FOUND", "Service not found");
  res.json({ success: true, data: service });
});

// --- bookings & payments (read-only) ---

// GET /api/admin/bookings — every booking on the platform, filterable by ?status=.
adminRouter.get("/bookings", async (req, res) => {
  res.json({ success: true, data: await listBookings({}, req.query) });
});

// GET /api/admin/payments — every payment, with the total revenue across all of them.
adminRouter.get("/payments", async (req, res) => {
  const [list, [revenue]] = await Promise.all([
    listPayments({}, req.query),
    PaymentModel.aggregate<{ total: number }>([{ $group: { _id: null, total: { $sum: "$amount" } } }]),
  ]);
  res.json({ success: true, data: { ...list, totalRevenue: Math.round((revenue?.total ?? 0) * 100) / 100 } });
});
