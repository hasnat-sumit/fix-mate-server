import { Router } from "express";
import type { Types } from "mongoose";
import { AppError, isDuplicateKeyError, type ErrorCode } from "../../lib/errors.js";
import { paginate } from "../../lib/pagination.js";
import { countsByKey } from "../../lib/stats.js";
import { isObjectIdString } from "../../lib/validators.js";
import { authUser, verifyCustomer, verifyTechnician, verifyToken, type AuthUser } from "../../middleware/auth.js";
import { PaymentModel } from "../payments/payments.model.js";
import { ServiceModel } from "../services/services.model.js";
import { UserModel } from "../users/users.model.js";
import { ACTIVE_BOOKING_STATUSES, BOOKING_STATUSES, BookingModel, bookingStatusFields, type Booking, type BookingStatus } from "./bookings.model.js";
import { createBookingBody, createReviewBody, listBookingsQuery, updateStatusBody } from "./bookings.schemas.js";
import { checkTransition } from "./bookings.workflow.js";

export const bookingsRouter = Router();

export type BookingDoc = Booking & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

const notFound = () => new AppError(404, "NOT_FOUND", "Booking not found");
const ERROR_CODES: Record<400 | 403 | 409, ErrorCode> = { 400: "VALIDATION_ERROR", 403: "FORBIDDEN", 409: "CONFLICT" };

/** Restricts queries to bookings the user may see: their own as customer, their jobs as technician, all as admin. */
function accessFilter(user: AuthUser) {
  if (user.role === "admin") return {};
  return user.role === "customer" ? { customerEmail: user.email } : { technicianEmail: user.email };
}

export async function listBookings(ownerFilter: Record<string, unknown>, rawQuery: unknown) {
  const query = listBookingsQuery.parse(rawQuery);
  const filter = { ...ownerFilter, ...(query.status ? { status: query.status } : {}) };
  const total = await BookingModel.countDocuments(filter);
  const { page, pageCount, skip } = paginate(total, query.page, query.limit);
  const items = await BookingModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(query.limit).lean<BookingDoc[]>();
  return { items, page, limit: query.limit, total, pageCount };
}

/** Booking counts per status for one owner filter, with every status present. */
async function statusCounts(ownerFilter: Record<string, unknown>) {
  const rows = await BookingModel.aggregate<{ _id: string; count: number }>([
    { $match: ownerFilter },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  return countsByKey(BOOKING_STATUSES, rows) as Record<BookingStatus, number>;
}

async function paidTotal(filter: Record<string, unknown>) {
  const [row] = await PaymentModel.aggregate<{ total: number }>([{ $match: filter }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
  return Math.round((row?.total ?? 0) * 100) / 100;
}

/**
 * Moves a booking to `next` if the workflow allows it, conditional on the status that was checked,
 * so two people acting at once can't both succeed. Ownership is part of the query.
 */
async function changeStatus(req: Parameters<typeof authUser>[0], next: BookingStatus, extra: Record<string, unknown> = {}) {
  const id = req.params.id;
  if (!isObjectIdString(id)) throw notFound();
  const user = authUser(req);
  const scope = { _id: id, ...accessFilter(user) };

  const current = await BookingModel.findOne(scope).select("status").lean();
  if (!current) throw notFound();

  const check = checkTransition(current.status, next, user.role);
  if (!check.ok) throw new AppError(check.status, ERROR_CODES[check.status], check.message);

  const updated = await BookingModel.findOneAndUpdate(
    { ...scope, status: current.status },
    { $set: { ...bookingStatusFields(next), ...extra }, $push: { statusHistory: { status: next, changedAt: new Date() } } },
    { returnDocument: "after", runValidators: true },
  ).lean<BookingDoc>();
  if (!updated) throw new AppError(409, "CONFLICT", "This booking was just updated. Refresh and try again.");
  return updated;
}

// POST /api/bookings — customers send a repair request. Price and technician come from the database, never the client.
bookingsRouter.post("/", verifyToken, verifyCustomer, async (req, res) => {
  const body = createBookingBody.parse(req.body);
  const user = authUser(req);

  const service = await ServiceModel.findOne({ _id: body.serviceId, approvalStatus: "approved", isAvailable: true }).lean();
  const technician = service ? await UserModel.findOne({ email: service.technicianEmail }).select("status").lean() : null;
  if (!service || technician?.status !== "active") {
    throw new AppError(404, "NOT_FOUND", "This service isn't accepting requests");
  }
  if (service.technicianEmail === user.email) throw new AppError(403, "FORBIDDEN", "You can't request your own service");

  let booking;
  try {
    booking = await BookingModel.create({
      serviceId: service._id.toString(),
      serviceTitle: service.title,
      serviceImage: service.image,
      category: service.category,
      basePrice: service.basePrice,
      technicianName: service.technicianName,
      technicianEmail: service.technicianEmail,
      customerName: user.name,
      customerEmail: user.email,
      customerPhone: body.customerPhone,
      address: body.address,
      preferredDate: body.preferredDate,
      problemDescription: body.problemDescription,
      status: "requested",
      finalAmount: service.basePrice,
      paymentStatus: "unpaid",
      statusHistory: [{ status: "requested", changedAt: new Date() }],
    });
  } catch (error) {
    // The partial unique index allows one active (requested/accepted/in-progress) request per customer and service.
    if (isDuplicateKeyError(error)) {
      throw new AppError(409, "CONFLICT", "You already have an active request for this service");
    }
    throw error;
  }

  res.status(201).json({ success: true, data: booking.toObject() });
});

// --- customer --- (registered before /:id so the words are never treated as IDs)

// GET /api/bookings/my — the customer's own bookings. The email always comes from the token, never the URL.
bookingsRouter.get("/my", verifyToken, verifyCustomer, async (req, res) => {
  res.json({ success: true, data: await listBookings({ customerEmail: authUser(req).email }, req.query) });
});

// GET /api/bookings/my/stats — customer overview cards and chart.
bookingsRouter.get("/my/stats", verifyToken, verifyCustomer, async (req, res) => {
  const email = authUser(req).email;
  const [byStatus, totalPaid] = await Promise.all([statusCounts({ customerEmail: email }), paidTotal({ customerEmail: email })]);
  const total = Object.values(byStatus).reduce((sum, count) => sum + count, 0);
  res.json({
    success: true,
    data: {
      totalRequests: total,
      activeJobs: ACTIVE_BOOKING_STATUSES.reduce((sum, status) => sum + byStatus[status], 0),
      completedJobs: byStatus.completed,
      totalPaid,
      byStatus,
    },
  });
});

// --- technician ---

// GET /api/bookings/technician — jobs where technicianEmail is the signed-in technician.
bookingsRouter.get("/technician", verifyToken, verifyTechnician, async (req, res) => {
  res.json({ success: true, data: await listBookings({ technicianEmail: authUser(req).email }, req.query) });
});

// GET /api/bookings/technician/stats — technician overview cards and chart.
bookingsRouter.get("/technician/stats", verifyToken, verifyTechnician, async (req, res) => {
  const email = authUser(req).email;
  const [totalServices, approvedServices, byStatus, totalEarned] = await Promise.all([
    ServiceModel.countDocuments({ technicianEmail: email }),
    ServiceModel.countDocuments({ technicianEmail: email, approvalStatus: "approved" }),
    statusCounts({ technicianEmail: email }),
    paidTotal({ technicianEmail: email }),
  ]);
  res.json({
    success: true,
    data: { totalServices, approvedServices, pendingRequests: byStatus.requested, totalEarned, byStatus },
  });
});

// --- shared ---

// GET /api/bookings/:id — details and timeline, for the booking's customer, its technician or an admin.
bookingsRouter.get("/:id", verifyToken, async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw notFound();
  const booking = await BookingModel.findOne({ _id: req.params.id, ...accessFilter(authUser(req)) }).lean<BookingDoc>();
  if (!booking) throw notFound();
  res.json({ success: true, data: booking });
});

// PATCH /api/bookings/:id/cancel — the booking's customer cancels while it is still "requested".
bookingsRouter.patch("/:id/cancel", verifyToken, verifyCustomer, async (req, res) => {
  res.json({ success: true, data: await changeStatus(req, "cancelled") });
});

// PATCH /api/bookings/:id/status — the job's technician moves it along the pipeline (see bookings.workflow.ts).
// Completing requires { status: "completed", finalAmount > 0 }.
bookingsRouter.patch("/:id/status", verifyToken, verifyTechnician, async (req, res) => {
  const body = updateStatusBody.parse(req.body);
  const extra = body.status === "completed" ? { finalAmount: body.finalAmount } : {};
  res.json({ success: true, data: await changeStatus(req, body.status, extra) });
});

// POST /api/bookings/:id/review — one rating & review per paid booking, by its customer.
bookingsRouter.post("/:id/review", verifyToken, verifyCustomer, async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw notFound();
  const body = createReviewBody.parse(req.body);
  const scope = { _id: req.params.id, customerEmail: authUser(req).email };

  // Conditional update: only paid bookings without a rating, so double submissions can't create two.
  const updated = await BookingModel.findOneAndUpdate(
    { ...scope, paymentStatus: "paid", rating: null },
    { $set: { rating: body.rating, review: body.review, reviewedAt: new Date() } },
    { returnDocument: "after", runValidators: true },
  ).lean<BookingDoc>();

  if (!updated) {
    const existing = await BookingModel.findOne(scope).select("rating").lean();
    if (!existing) throw notFound();
    if (existing.rating) throw new AppError(409, "CONFLICT", "You've already reviewed this booking");
    throw new AppError(409, "CONFLICT", "You can review a job once it's paid");
  }

  res.status(201).json({ success: true, data: updated });
});
