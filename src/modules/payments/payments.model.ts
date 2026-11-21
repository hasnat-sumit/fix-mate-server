import { model, Schema, type InferSchemaType } from "mongoose";
import { wholeCents } from "../../lib/validators.js";

export const PAYMENT_STATUSES = ["pending", "paid", "failed"] as const;

/** Unique only when the field holds a string, so documents without it never collide. */
const uniqueWhenPresent = (field: string) => ({
  unique: true,
  partialFilterExpression: { [field]: { $type: "string" } },
});

const paymentSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    technicianId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    /** Copied from the booking on the server; never accepted from the client. */
    amount: { type: Number, required: true, min: 100, validate: wholeCents },
    currency: { type: String, enum: ["usd"], required: true, default: "usd" },
    status: { type: String, enum: PAYMENT_STATUSES, required: true, default: "pending" },
    provider: { type: String, enum: ["stripe"], required: true, default: "stripe" },
    stripeCheckoutSessionId: { type: String },
    stripePaymentIntentId: { type: String },
    receiptUrl: { type: String },
    paidAt: { type: Date },
    invoiceNumber: { type: String },
  },
  { collection: "payments", timestamps: true },
);

// One payment record per booking: repeat checkouts update it instead of creating duplicates.
paymentSchema.index({ bookingId: 1 }, { unique: true });
paymentSchema.index({ stripeCheckoutSessionId: 1 }, uniqueWhenPresent("stripeCheckoutSessionId"));
paymentSchema.index({ stripePaymentIntentId: 1 }, uniqueWhenPresent("stripePaymentIntentId"));
paymentSchema.index({ invoiceNumber: 1 }, uniqueWhenPresent("invoiceNumber"));
paymentSchema.index({ customerId: 1, createdAt: -1 });
paymentSchema.index({ technicianId: 1, createdAt: -1 });

export type Payment = InferSchemaType<typeof paymentSchema>;
export const PaymentModel = model("Payment", paymentSchema);
