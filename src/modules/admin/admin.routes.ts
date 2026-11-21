import { Router } from "express";
import type { Types } from "mongoose";
import { z } from "zod";
import { getNativeDb } from "../../db/client.js";
import { AppError } from "../../lib/errors.js";
import { pageQuery, paginate } from "../../lib/pagination.js";
import { escapeRegex, isObjectIdString } from "../../lib/validators.js";
import { authUser, requireAuth, requireRole } from "../../middleware/auth.js";
import { BOOKING_STATUSES, BookingModel } from "../bookings/bookings.model.js";
import { listBookings } from "../bookings/bookings.routes.js";
import { PaymentModel } from "../payments/payments.model.js";
import { APPROVAL_STATUSES, ServiceModel } from "../services/services.model.js";
import type { ServiceDoc } from "../services/services.routes.js";
import { USER_ROLES, USER_STATUSES, UserModel } from "../users/users.model.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("admin"));

const countBy = (rows: { _id: string | null; count: number }[]) =>
  Object.fromEntries(rows.filter((row) => row._id !== null).map((row) => [row._id, row.count])) as Record<string, number>;

// GET /api/admin/stats — real counts from the database; nothing is estimated.
adminRouter.get("/stats", async (_req, res) => {
  const [roles, suspended, services, bookings, revenue] = await Promise.all([
    UserModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    UserModel.countDocuments({ status: "suspended" }),
    ServiceModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$approvalStatus", count: { $sum: 1 } } }]),
    BookingModel.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    PaymentModel.aggregate<{ total: number; count: number }>([
      { $match: { paymentStatus: "paid" } },
      { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
    ]),
  ]);

  const withZeros = (keys: readonly string[], counts: Record<string, number>) =>
    Object.fromEntries(keys.map((key) => [key, counts[key] ?? 0])) as Record<string, number>;

  res.json({
    success: true,
    data: {
      users: { ...withZeros(USER_ROLES, countBy(roles)), suspended },
      services: withZeros(APPROVAL_STATUSES, countBy(services)),
      bookings: withZeros(BOOKING_STATUSES, countBy(bookings)),
      revenue: { amount: revenue[0]?.total ?? 0, payments: revenue[0]?.count ?? 0 },
    },
  });
});

// --- users ---

const listUsersQuery = z.object({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  ...pageQuery,
});

type UserRow = { _id: Types.ObjectId; name: string; email: string; role: string; status: string; createdAt: Date };
const toUserRow = (user: UserRow) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status,
  createdAt: user.createdAt,
});

adminRouter.get("/users", async (req, res) => {
  const query = listUsersQuery.parse(req.query);
  const search = query.q ? { $regex: escapeRegex(query.q), $options: "i" } : undefined;
  const filter = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(search ? { $or: [{ name: search }, { email: search }] } : {}),
  };
  const total = await UserModel.countDocuments(filter);
  const { page, pageCount, skip } = paginate(total, query.page, query.limit);
  const users = await UserModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(query.limit)
    .select("name email role status createdAt")
    .lean<UserRow[]>();
  res.json({ success: true, data: { items: users.map(toUserRow), page, limit: query.limit, total, pageCount } });
});

const updateUserBody = z.strictObject({ status: z.enum(USER_STATUSES) });

// PATCH /api/admin/users/:id — suspend or reactivate. Admin accounts (including your own) can't be changed here.
adminRouter.patch("/users/:id", async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw new AppError(404, "NOT_FOUND", "User not found");
  const { status } = updateUserBody.parse(req.body);
  if (req.params.id === authUser(req).id) throw new AppError(403, "FORBIDDEN", "You can't change your own account status");

  const user = await UserModel.findOneAndUpdate(
    { _id: req.params.id, role: { $ne: "admin" } },
    { $set: { status } },
    { returnDocument: "after" },
  )
    .select("name email role status createdAt")
    .lean<UserRow>();
  if (!user) throw new AppError(404, "NOT_FOUND", "User not found, or it's an admin account");

  // Suspension also signs the user out everywhere; requireAuth already rejects their API tokens.
  if (status === "suspended") await getNativeDb().collection("session").deleteMany({ userId: user._id });
  res.json({ success: true, data: toUserRow(user) });
});

// --- services ---

const listServicesQuery = z.object({ approvalStatus: z.enum(APPROVAL_STATUSES).optional(), ...pageQuery });

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

// --- bookings ---

// GET /api/admin/bookings — every booking. Admins cancel through PATCH /api/bookings/:id/status.
adminRouter.get("/bookings", async (req, res) => {
  res.json({ success: true, data: await listBookings({}, req.query) });
});
