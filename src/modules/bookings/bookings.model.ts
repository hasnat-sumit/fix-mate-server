import { model, Schema, type InferSchemaType } from "mongoose";
import { imageUrl, usdAmount } from "../../lib/validators.js";
import { SERVICE_CATEGORIES } from "../services/services.model.js";

/** Job status pipeline; allowed transitions are enforced in bookings.workflow.ts. */
export const BOOKING_STATUSES = ["requested", "accepted", "rejected", "in-progress", "completed", "cancelled"] as const;
/** A customer can hold only one booking in these statuses per service. */
export const ACTIVE_BOOKING_STATUSES = ["requested", "accepted", "in-progress"] as const;
export const PAYMENT_STATES = ["unpaid", "paid"] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export function isActiveBookingStatus(status: BookingStatus) {
  return (ACTIVE_BOOKING_STATUSES as readonly BookingStatus[]).includes(status);
}

/**
 * Fields to $set whenever a booking's status changes through an update query.
 * Keeping `isActive` in step with `status` is what makes the duplicate-request index work.
 */
export function bookingStatusFields(status: BookingStatus) {
  return { status, isActive: isActiveBookingStatus(status) };
}

const statusHistoryEntrySchema = new Schema(
  {
    status: { type: String, enum: [...BOOKING_STATUSES, "paid"], required: true },
    changedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

/**
 * A repair request (job). Service, technician and customer details are copied in at request time,
 * so the booking still reads correctly if the service is later edited or deleted.
 */
const bookingSchema = new Schema(
  {
    serviceId: { type: String, required: true },
    serviceTitle: { type: String, required: true },
    serviceImage: { type: String, required: true, validate: imageUrl },
    category: { type: String, enum: SERVICE_CATEGORIES, required: true },
    /** Copied from the service at request time (USD). */
    basePrice: { type: Number, required: true, min: 1, validate: usdAmount },
    technicianName: { type: String, required: true },
    technicianEmail: { type: String, required: true, lowercase: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true, lowercase: true },
    customerPhone: { type: String, required: true, trim: true, match: [/^\+?[0-9\s()-]{7,20}$/, "Invalid phone number"] },
    address: { type: String, required: true, trim: true, minlength: 5, maxlength: 200 },
    /** Stored as UTC midnight of the chosen calendar date. "Today or later" is checked in bookings.schemas.ts. */
    preferredDate: { type: Date, required: true },
    problemDescription: { type: String, required: true, trim: true, minlength: 20, maxlength: 1000 },
    status: { type: String, enum: BOOKING_STATUSES, required: true, default: "requested" },
    /** Set by the technician on completion; defaults to basePrice. The only source of the payment amount. */
    finalAmount: { type: Number, required: true, min: 1, validate: usdAmount },
    paymentStatus: { type: String, enum: PAYMENT_STATES, required: true, default: "unpaid" },
    /** Derived from `status`; backs the one-active-request-per-service index. */
    isActive: { type: Boolean, required: true, default: true },
    /** Job timeline: one entry per status change, including the final "paid" step. */
    statusHistory: { type: [statusHistoryEntrySchema], default: [] },
    /** Optional rating & review, left by the customer after paying. */
    rating: { type: Number, min: 1, max: 5, validate: { validator: Number.isInteger, message: "Rating must be a whole number" } },
    review: { type: String, trim: true, maxlength: 1000 },
    reviewedAt: { type: Date },
  },
  { collection: "bookings", timestamps: true, versionKey: false },
);

// Documents saved through Mongoose derive `isActive` from `status`; update queries use bookingStatusFields().
bookingSchema.pre("validate", function () {
  this.isActive = isActiveBookingStatus(this.status);
});

bookingSchema.index({ customerEmail: 1, createdAt: -1 });
bookingSchema.index({ technicianEmail: 1, status: 1, createdAt: -1 });
bookingSchema.index({ serviceId: 1 });
bookingSchema.index({ status: 1, createdAt: -1 });
// A customer can hold only one active request per service, enforced by the database even under concurrent requests.
bookingSchema.index(
  { customerEmail: 1, serviceId: 1 },
  { unique: true, partialFilterExpression: { isActive: true }, name: "one_active_request_per_customer_service" },
);

export type Booking = InferSchemaType<typeof bookingSchema>;
export const BookingModel = model("Booking", bookingSchema);
