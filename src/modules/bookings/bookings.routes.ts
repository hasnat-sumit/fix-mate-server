import { Router } from "express";
import type { Types } from "mongoose";
import { AppError, isDuplicateKeyError, type ErrorCode } from "../../lib/errors.js";
import { paginate } from "../../lib/pagination.js";
import { isObjectIdString } from "../../lib/validators.js";
import { authUser, requireAuth, requireRole, type AuthUser } from "../../middleware/auth.js";
import { ServiceModel } from "../services/services.model.js";
import { UserModel } from "../users/users.model.js";
import { BookingModel, bookingStatusFields, type Booking } from "./bookings.model.js";
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

// POST /api/bookings — customers send a repair request. Price and technician come from the database, never the client.
bookingsRouter.post("/", requireAuth, requireRole("customer"), async (req, res) => {
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

// GET /api/bookings/mine — the customer's own requests. GET /api/bookings/jobs — the technician's jobs.
// Both are registered before /:id so the words are never treated as IDs.
bookingsRouter.get("/mine", requireAuth, requireRole("customer"), async (req, res) => {
  res.json({ success: true, data: await listBookings({ customerEmail: authUser(req).email }, req.query) });
});

bookingsRouter.get("/jobs", requireAuth, requireRole("technician"), async (req, res) => {
  res.json({ success: true, data: await listBookings({ technicianEmail: authUser(req).email }, req.query) });
});

// GET /api/bookings/:id — details and timeline, for the booking's customer, its technician or an admin.
bookingsRouter.get("/:id", requireAuth, async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw notFound();
  const booking = await BookingModel.findOne({ _id: req.params.id, ...accessFilter(authUser(req)) }).lean<BookingDoc>();
  if (!booking) throw notFound();
  res.json({ success: true, data: booking });
});

// PATCH /api/bookings/:id/status — moves the job along the pipeline (see bookings.workflow.ts).
bookingsRouter.patch("/:id/status", requireAuth, requireRole("customer", "technician"), async (req, res) => {
  if (!isObjectIdString(req.params.id)) throw notFound();
  const body = updateStatusBody.parse(req.body);
  const user = authUser(req);
  const scope = { _id: req.params.id, ...accessFilter(user) };

  const current = await BookingModel.findOne(scope).select("status").lean();
  if (!current) throw notFound();

  const check = checkTransition(current.status, body.status, user.role);
  if (!check.ok) throw new AppError(check.status, ERROR_CODES[check.status], check.message);

  // Conditional on the status we checked, so two people acting at once can't both succeed.
  const updated = await BookingModel.findOneAndUpdate(
    { ...scope, status: current.status },
    {
      $set: { ...bookingStatusFields(body.status), ...(body.status === "completed" ? { finalAmount: body.finalAmount } : {}) },
      $push: { statusHistory: { status: body.status, changedAt: new Date() } },
    },
    { returnDocument: "after", runValidators: true },
  ).lean<BookingDoc>();
  if (!updated) throw new AppError(409, "CONFLICT", "This booking was just updated. Refresh and try again.");

  res.json({ success: true, data: updated });
});

// POST /api/bookings/:id/review — one rating & review per paid booking, by its customer.
bookingsRouter.post("/:id/review", requireAuth, requireRole("customer"), async (req, res) => {
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
