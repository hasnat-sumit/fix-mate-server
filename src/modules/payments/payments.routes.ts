import express, { Router, type RequestHandler } from "express";
import type { Types } from "mongoose";
import { z } from "zod";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { pageQuery, paginate } from "../../lib/pagination.js";
import { isObjectIdString } from "../../lib/validators.js";
import { authUser, verifyCustomer, verifyToken } from "../../middleware/auth.js";
import { PaymentModel, type Payment } from "./payments.model.js";
import { createCheckoutSession, getStripe, recordPaidSession } from "./payments.service.js";

export const paymentsRouter = Router();

export type PaymentDoc = Payment & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

const listPaymentsQuery = z.object(pageQuery);

/** Newest first, paginated. Used by the customer's history and the admin's transactions. */
export async function listPayments(filter: Record<string, unknown>, rawQuery: unknown) {
  const query = listPaymentsQuery.parse(rawQuery);
  const total = await PaymentModel.countDocuments(filter);
  const { page, pageCount, skip } = paginate(total, query.page, query.limit);
  const items = await PaymentModel.find(filter).sort({ paidAt: -1, _id: -1 }).skip(skip).limit(query.limit).lean<PaymentDoc[]>();
  return { items, page, limit: query.limit, total, pageCount };
}

// GET /api/payments/my — the customer's payment history. The email always comes from the token.
paymentsRouter.get("/my", verifyToken, verifyCustomer, async (req, res) => {
  res.json({ success: true, data: await listPayments({ customerEmail: authUser(req).email }, req.query) });
});

const checkoutBody = z.strictObject({ bookingId: z.string().refine(isObjectIdString, "Invalid booking") });

// POST /api/payments/create-checkout-session — Pay Now for a completed, unpaid booking the customer owns.
paymentsRouter.post("/create-checkout-session", verifyToken, verifyCustomer, async (req, res) => {
  const { bookingId } = checkoutBody.parse(req.body);
  const url = await createCheckoutSession(bookingId, authUser(req).email);
  res.status(201).json({ success: true, data: { url } });
});

const verifyQuery = z.object({ session_id: z.string().regex(/^cs_[A-Za-z0-9_]+$/, "Invalid session") });

// GET /api/payments/verify?session_id=... — called by /payment/success. Saves the payment if Stripe says it's paid.
// Safe to call repeatedly (e.g. on reload) and alongside the webhook: the payment is saved only once.
paymentsRouter.get("/verify", verifyToken, verifyCustomer, async (req, res) => {
  const { session_id: sessionId } = verifyQuery.parse(req.query);

  let session;
  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(404, "NOT_FOUND", "Payment session not found");
  }
  // Another customer's session is indistinguishable from a missing one.
  if (session.metadata?.customerEmail !== authUser(req).email) throw new AppError(404, "NOT_FOUND", "Payment session not found");
  if (session.payment_status !== "paid") throw new AppError(409, "CONFLICT", "This payment hasn't been completed yet");

  const { payment } = await recordPaidSession(session);
  res.json({ success: true, data: payment });
});

/**
 * POST /api/payments/webhook — Stripe → server (Challenge 4). Mounted in app.ts BEFORE express.json(),
 * because the signature is computed over the raw body. Shares recordPaidSession with /verify, so a payment
 * confirmed by both (or retried by Stripe) is saved exactly once.
 */
export const stripeWebhookHandler: RequestHandler[] = [
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req, res) => {
    if (!env.STRIPE_WEBHOOK_SECRET) throw new AppError(503, "SERVICE_UNAVAILABLE", "The Stripe webhook isn't configured");
    const signature = req.get("stripe-signature");
    if (!signature || !Buffer.isBuffer(req.body)) throw new AppError(400, "BAD_REQUEST", "Missing Stripe signature");

    let event;
    try {
      event = getStripe().webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new AppError(400, "BAD_REQUEST", "Invalid Stripe signature");
    }

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object;
      if (session.payment_status === "paid") {
        try {
          const { recorded } = await recordPaidSession(session);
          console.log(`Stripe webhook ${event.type}: session ${session.id} ${recorded ? "recorded" : "already recorded"}`);
        } catch (error) {
          // A 4xx here (e.g. booking deleted, amount mismatch) won't fix itself on retry, so acknowledge it.
          if (!(error instanceof AppError) || error.statusCode >= 500) throw error;
          console.error(`Stripe webhook: session ${session.id} not recorded: ${error.message}`);
        }
      }
    }
    // Every other event type is acknowledged and ignored.
    res.json({ received: true });
  },
];
