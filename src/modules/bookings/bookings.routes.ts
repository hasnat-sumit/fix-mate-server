import { Router } from "express";
import type { Types } from "mongoose";
import { AppError, isDuplicateKeyError, type ErrorCode } from "../../lib/errors.js";
import { isObjectIdString } from "../../lib/validators.js";
import { authUser, requireAuth, requireRole, type AuthUser } from "../../middleware/auth.js";
import { ServiceModel } from "../services/services.model.js";
import { BookingModel, bookingStatusFields, type Booking } from "./bookings.model.js";
import { createBookingBody, createReviewBody, listBookingsQuery, updateStatusBody } from "./bookings.schemas.js";
import { checkTransition } from "./bookings.workflow.js";

export const bookingsRouter = Router();

type Party = { _id: Types.ObjectId; name: string } | null;
type PopulatedBooking = Omit<Booking, "customerId" | "technicianId"> & {
  _id: Types.ObjectId;
  customerId: Party;
  technicianId: Party;
  createdAt: Date;
  updatedAt: Date;
};

const notFound = () => new AppError(404, "NOT_FOUND", "Booking not found");
const ERROR_CODES: Record<400 | 403 | 409, ErrorCode> = { 400: "VALIDATION_ERROR", 403: "FORBIDDEN", 409: "CONFLICT" };

const party = (value: Party) => (value ? { id: value._id.toString(), name: value.name } : { id: null, name: "Deleted account" });

function toBookingView(booking: PopulatedBooking) {
  return {
    id: booking._id.toString(),
    service: { id: booking.serviceId.toString(), ...booking.serviceSnapshot },
    amount: booking.amount,
    preferredDate: booking.preferredDate.toISOString().slice(0, 10),
    problemDescription: booking.problemDescription,
    address: booking.address,
    contactPhone: booking.contactPhone,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    review: booking.review ?? null,
    statusHistory: booking.statusHistory.map(({ status, role, note, at }) => ({ status, role, note: note ?? null, at })),
    customer: party(booking.customerId),
    technician: party(booking.technicianId),
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}

/** Restricts queries to bookings the user may see: their own as customer, their jobs as technician, all as admin. */
function accessFilter(user: AuthUser) {
  if (user.role === "admin") return {};
  return user.role === "customer" ? { customerId: user.id } : { technicianId: user.id };
}

async function findBookingView(filter: Record<string, unknown>) {
  const booking = await BookingModel.findOne(filter)
    .populate("customerId", "name")
    .populate("technicianId", "name")
    .lean<PopulatedBooking>();
  return booking ? toBookingView(booking) : null;
}

export async function listBookings(ownerFilter: Record<string, unknown>, rawQuery: unknown) {
  const query = listBookingsQuery.parse(rawQuery);
  const filter = { ...ownerFilter, ...(query.status ? { status: query.status } : {}) };
  const total = await BookingModel.countDocuments(filter);
  const pageCount = Math.max(1, Math.ceil(total / query.limit));
  const page = Math.min(query.page, pageCount);
  const bookings = await BookingModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * query.limit)
    .limit(query.limit)
    .populate("customerId", "name")
    .populate("technicianId", "name")
    .lean<PopulatedBooking[]>();
  return { items: bookings.map(toBookingView), page, limit: query.limit, total, pageCount };
}

/** Recalculates a service's rating from its bookings' reviews, so the stored aggregate never drifts. */
async function refreshServiceRating(serviceId: Types.ObjectId) {
  const [stats] = await BookingModel.aggregate<{ average: number; count: number }>([
    { $match: { serviceId, review: { $ne: null } } },
    { $group: { _id: null, average: { $avg: "$review.rating" }, count: { $sum: 1 } } },
  ]);
  await ServiceModel.updateOne(
    { _id: serviceId },
    { $set: { ratingAverage: stats ? Math.round(stats.average * 10) / 10 : 0, reviewCount: stats?.count ?? 0 } },
  );
}

// POST /api/bookings — customers request a service. Price and technician come from the database, never the client.
bookingsRouter.post("/", requireAuth, requireRole("customer"), async (req, res) => {
  const body = createBookingBody.parse(req.body);
  const user = authUser(req);

  const service = await ServiceModel.findOne({ _id: body.serviceId, approvalStatus: "approved", isActive: true })
    .populate<{ technicianId: { _id: Types.ObjectId; status: string } | null }>("technicianId", "status")
    .lean();
  if (!service || service.technicianId?.status !== "active") {
    throw new AppError(404, "NOT_FOUND", "This service isn't accepting requests");
  }

  let bookingId: Types.ObjectId;
  try {
    const booking = await BookingModel.create({
      customerId: user.id,
      technicianId: service.technicianId._id,
      serviceId: service._id,
      serviceSnapshot: { title: service.title, category: service.category, price: service.price },
      amount: service.price,
      preferredDate: body.preferredDate,
      problemDescription: body.problemDescription,
      address: body.address,
      contactPhone: body.contactPhone,
      statusHistory: [{ status: "pending", changedBy: user.id, role: user.role }],
    });
    bookingId = booking._id;
  } catch (error) {
    // The partial unique index allows one active (pending/accepted/in-progress) request per customer and service.
    if (isDuplicateKeyError(error)) {
      throw new AppError(409, "CONFLICT", "You already have an active request for this service");
    }
    throw error;
  }

  res.status(201).json({ success: true, data: await findBookingView({ _id: bookingId }) });
});

// GET /api/bookings/mine — the customer's own requests. GET /api/bookings/jobs — the technician's assigned jobs.
// Both are registered before /:id so the words are never treated as IDs.
bookingsRouter.get("/mine", requireAuth, requireRole("customer"), async (req, res) => {
  res.json({ success: true, data: await listBookings({ customerId: authUser(req).id }, req.query) });
});

bookingsRouter.get("/jobs", requireAuth, requireRole("technician"), async (req, res) => {
  res.json({ success: true, data: await listBookings({ technicianId: authUser(req).id }, req.query) });
});

// GET /api/bookings/:id — details and timeline, for the booking's customer, its technician or an admin.
bookingsRouter.get("/:id", requireAuth, async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw notFound();
  const booking = await findBookingView({ _id: req.params.id, ...accessFilter(authUser(req)) });
  if (!booking) throw notFound();
  res.json({ success: true, data: booking });
});

// PATCH /api/bookings/:id/status — moves the booking along the pipeline (see bookings.workflow.ts).
bookingsRouter.patch("/:id/status", requireAuth, async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw notFound();
  const body = updateStatusBody.parse(req.body);
  const user = authUser(req);
  const scope = { _id: req.params.id, ...accessFilter(user) };

  const current = await BookingModel.findOne(scope).select("status").lean();
  if (!current) throw notFound();

  const check = checkTransition(current.status, body.status, user.role, body.note);
  if (!check.ok) throw new AppError(check.status, ERROR_CODES[check.status], check.message);

  // Conditional on the status we checked, so two people acting at once can't both succeed.
  const updated = await BookingModel.findOneAndUpdate(
    { ...scope, status: current.status },
    {
      $set: bookingStatusFields(body.status),
      $push: { statusHistory: { status: body.status, changedBy: user.id, role: user.role, note: body.note || undefined, at: new Date() } },
    },
    { returnDocument: "after", runValidators: true },
  );
  if (!updated) throw new AppError(409, "CONFLICT", "This booking was just updated by someone else. Refresh and try again.");

  res.json({ success: true, data: await findBookingView({ _id: updated._id }) });
});

// POST /api/bookings/:id/review — one review per completed booking, by its customer.
bookingsRouter.post("/:id/review", requireAuth, requireRole("customer"), async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw notFound();
  const body = createReviewBody.parse(req.body);
  const scope = { _id: req.params.id, customerId: authUser(req).id };

  // Conditional update: only completed bookings without a review, so double submissions can't create two.
  const updated = await BookingModel.findOneAndUpdate(
    { ...scope, status: "completed", review: null },
    { $set: { review: { rating: body.rating, comment: body.comment, createdAt: new Date() } } },
    { returnDocument: "after", runValidators: true },
  );

  if (!updated) {
    const existing = await BookingModel.findOne(scope).select("status review").lean();
    if (!existing) throw notFound();
    if (existing.review) throw new AppError(409, "CONFLICT", "You've already reviewed this booking");
    throw new AppError(409, "CONFLICT", "You can review a booking once it's completed");
  }

  await refreshServiceRating(updated.serviceId);
  res.status(201).json({ success: true, data: await findBookingView({ _id: updated._id }) });
});
