import { createHash } from "node:crypto";
import Stripe from "stripe";
import { env } from "../../config/env.js";
import { AppError, isDuplicateKeyError } from "../../lib/errors.js";
import { BookingModel } from "../bookings/bookings.model.js";
import { PaymentModel } from "./payments.model.js";

let stripe: Stripe | undefined;

/** The Stripe client (test mode). 503 when STRIPE_SECRET_KEY isn't configured. */
export function getStripe() {
  if (!env.STRIPE_SECRET_KEY) throw new AppError(503, "SERVICE_UNAVAILABLE", "Payments aren't configured on the server");
  stripe ??= new Stripe(env.STRIPE_SECRET_KEY);
  return stripe;
}

/** USD amount -> Stripe's integer cents. */
export const toCents = (amount: number) => Math.round(amount * 100);

/**
 * Creates a Checkout Session for one of the customer's own bookings. Only a completed, unpaid booking can be paid,
 * and the amount always comes from the booking in the database, never from the client.
 */
export async function createCheckoutSession(bookingId: string, customerEmail: string) {
  const booking = await BookingModel.findOne({ _id: bookingId, customerEmail }).lean();
  if (!booking) throw new AppError(404, "NOT_FOUND", "Booking not found");
  if (booking.paymentStatus === "paid") throw new AppError(409, "CONFLICT", "This job is already paid");
  if (booking.status !== "completed") throw new AppError(409, "CONFLICT", "You can pay once the technician marks the job completed");

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    customer_email: booking.customerEmail,
    client_reference_id: bookingId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: toCents(booking.finalAmount),
          product_data: { name: booking.serviceTitle, description: `Repair by ${booking.technicianName} · FixMate` },
        },
      },
    ],
    metadata: { bookingId, customerEmail: booking.customerEmail },
    payment_intent_data: { metadata: { bookingId } },
    success_url: `${env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.CLIENT_URL}/payment/cancel?booking=${bookingId}`,
  };

  // Clicking Pay Now again with identical details returns the same open session (Stripe keeps idempotency keys
  // for 24h, as long as a session lasts), so one job can't be charged through two sessions. The key includes a
  // fingerprint of every parameter: Stripe rejects a reused key with different parameters (e.g. another site URL
  // or a changed amount), and those cases need their own session.
  const fingerprint = createHash("sha256").update(JSON.stringify(params)).digest("hex").slice(0, 16);

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create(params, { idempotencyKey: `checkout-${bookingId}-${fingerprint}` });
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error("Stripe checkout session failed:", error instanceof Error ? error.message : error);
    throw new AppError(502, "BAD_GATEWAY", "Stripe couldn't start the payment. Please try again in a moment.");
  }

  if (!session.url) throw new AppError(502, "BAD_GATEWAY", "Stripe didn't return a checkout page. Please try again.");
  return session.url;
}

/**
 * Saves a paid Checkout Session: inserts the payment and marks the booking paid. Called by both the success page
 * (verify) and the webhook, possibly at the same moment and possibly more than once (Stripe retries webhooks).
 * The unique indexes on payments.bookingId and payments.stripeSessionId make the insert happen exactly once;
 * the booking update is conditional, so repeating it changes nothing.
 */
export async function recordPaidSession(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") throw new AppError(409, "CONFLICT", "This payment hasn't been completed");

  const bookingId = session.metadata?.bookingId;
  const booking = bookingId ? await BookingModel.findById(bookingId).lean() : null;
  if (!booking) throw new AppError(404, "NOT_FOUND", "The booking for this payment no longer exists");

  // Defence in depth: the session must be for this booking's customer and its exact amount.
  if (session.currency !== "usd" || session.amount_total !== toCents(booking.finalAmount) || session.metadata?.customerEmail !== booking.customerEmail) {
    console.error(`Stripe session ${session.id} doesn't match booking ${booking._id.toString()}; not recorded`);
    throw new AppError(409, "CONFLICT", "This payment doesn't match the booking. Please contact support.");
  }

  const transactionId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? session.id);
  let recorded = false;
  try {
    await PaymentModel.create({
      bookingId: booking._id.toString(),
      serviceTitle: booking.serviceTitle,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      technicianName: booking.technicianName,
      technicianEmail: booking.technicianEmail,
      amount: session.amount_total / 100,
      currency: "usd",
      transactionId,
      stripeSessionId: session.id,
      paymentStatus: "paid",
      paidAt: new Date(),
    });
    recorded = true;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    // Already saved by the other path (or a webhook retry). A different session for an already-paid booking
    // would be a double charge; it is logged for a manual refund rather than saved twice.
    const existing = await PaymentModel.findOne({ bookingId: booking._id.toString() }).lean();
    if (existing && existing.stripeSessionId !== session.id) {
      console.error(`Booking ${booking._id.toString()} was already paid by session ${existing.stripeSessionId}; refund session ${session.id} in Stripe`);
    }
  }

  // Idempotent: only an unpaid, completed booking changes, and the "paid" timeline step is added once.
  await BookingModel.updateOne(
    { _id: booking._id, status: "completed", paymentStatus: "unpaid" },
    { $set: { paymentStatus: "paid" }, $push: { statusHistory: { status: "paid", changedAt: new Date() } } },
  );

  return { recorded, payment: await PaymentModel.findOne({ bookingId: booking._id.toString() }).lean() };
}
