import { model, Schema, type InferSchemaType } from "mongoose";
import { usdAmount } from "../../lib/validators.js";

/**
 * The payment record of a paid job. Created only by the server after Stripe confirms the payment
 * (success-page verification or webhook); every value is copied from the booking, never from the client.
 */
const paymentSchema = new Schema(
  {
    bookingId: { type: String, required: true },
    serviceTitle: { type: String, required: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true, lowercase: true },
    technicianName: { type: String, required: true },
    technicianEmail: { type: String, required: true, lowercase: true },
    /** Paid amount in USD (= booking.finalAmount). */
    amount: { type: Number, required: true, min: 1, validate: usdAmount },
    currency: { type: String, enum: ["usd"], required: true, default: "usd" },
    /** Stripe payment_intent id. */
    transactionId: { type: String, required: true },
    /** Stripe Checkout Session id. */
    stripeSessionId: { type: String, required: true },
    paymentStatus: { type: String, enum: ["paid"], required: true, default: "paid" },
    paidAt: { type: Date, required: true, default: Date.now },
  },
  { collection: "payments", timestamps: true, versionKey: false },
);

// Never save the same payment twice: once per booking and once per Checkout Session,
// even when the success page and the webhook (or a webhook retry) race each other.
paymentSchema.index({ bookingId: 1 }, { unique: true });
paymentSchema.index({ stripeSessionId: 1 }, { unique: true });
paymentSchema.index({ customerEmail: 1, paidAt: -1 });
paymentSchema.index({ technicianEmail: 1, paidAt: -1 });
paymentSchema.index({ paidAt: -1 });

export type Payment = InferSchemaType<typeof paymentSchema>;
export const PaymentModel = model("Payment", paymentSchema);
