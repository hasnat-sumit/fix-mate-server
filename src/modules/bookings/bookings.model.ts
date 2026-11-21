import { model, Schema, type InferSchemaType } from "mongoose";
import { wholeCents } from "../../lib/validators.js";
import { SERVICE_CATEGORIES } from "../services/services.model.js";
import { USER_ROLES } from "../users/users.model.js";

/** Status pipeline; transitions are enforced in bookings.workflow.ts. */
export const BOOKING_STATUSES = ["pending", "accepted", "in_progress", "completed", "rejected", "cancelled"] as const;
export const ACTIVE_BOOKING_STATUSES = ["pending", "accepted", "in_progress"] as const;
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
    status: { type: String, enum: BOOKING_STATUSES, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: USER_ROLES, required: true },
    note: { type: String, trim: true, maxlength: 500 },
    at: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const serviceSnapshotSchema = new Schema(
  {
    title: { type: String, required: true },
    category: { type: String, enum: SERVICE_CATEGORIES, required: true },
    price: { type: Number, required: true, validate: wholeCents },
  },
  { _id: false },
);

const reviewSchema = new Schema(
  {
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: { validator: Number.isInteger, message: "Rating must be a whole number" },
    },
    comment: { type: String, trim: true, maxlength: 1000, default: "" },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const bookingSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    technicianId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: "Service", required: true },
    serviceSnapshot: { type: serviceSnapshotSchema, required: true },
    /** Amount due in cents, snapshotted at request time. The only source of the payment amount. */
    amount: { type: Number, required: true, min: 100, validate: wholeCents },
    /** Stored as UTC midnight of the chosen calendar date. "Today or later" is checked in bookings.schemas.ts. */
    preferredDate: { type: Date, required: true },
    problemDescription: { type: String, required: true, trim: true, minlength: 20, maxlength: 1000 },
    address: { type: String, required: true, trim: true, minlength: 5, maxlength: 200 },
    contactPhone: { type: String, required: true, trim: true, match: [/^\+?[0-9\s()-]{7,20}$/, "Invalid phone number"] },
    status: { type: String, enum: BOOKING_STATUSES, required: true, default: "pending" },
    isActive: { type: Boolean, required: true, default: true },
    statusHistory: { type: [statusHistoryEntrySchema], default: [] },
    paymentStatus: { type: String, enum: PAYMENT_STATES, required: true, default: "unpaid" },
    review: { type: reviewSchema, default: undefined },
  },
  { collection: "bookings", timestamps: true },
);

// Documents saved through Mongoose derive `isActive` from `status`; update queries use bookingStatusFields().
bookingSchema.pre("validate", function () {
  this.isActive = isActiveBookingStatus(this.status);
});

bookingSchema.index({ customerId: 1, createdAt: -1 });
bookingSchema.index({ technicianId: 1, status: 1 });
bookingSchema.index({ serviceId: 1 });
// A customer can hold only one active request per service, enforced by the database even under concurrent requests.
bookingSchema.index(
  { customerId: 1, serviceId: 1 },
  { unique: true, partialFilterExpression: { isActive: true }, name: "one_active_request_per_service" },
);

export type Booking = InferSchemaType<typeof bookingSchema>;
export const BookingModel = model("Booking", bookingSchema);
