import { Router } from "express";
import type { Types } from "mongoose";
import { z } from "zod";
import { pageQuery, paginate } from "../../lib/pagination.js";
import { authUser, verifyCustomer, verifyToken } from "../../middleware/auth.js";
import { PaymentModel, type Payment } from "./payments.model.js";

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
