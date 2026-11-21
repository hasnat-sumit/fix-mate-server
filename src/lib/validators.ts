import { z } from "zod";

/** True when a USD amount has at most two decimal places (whole cents). */
export function isWholeCents(value: number) {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

/** Mongoose validator: USD amounts are stored as numbers with at most two decimals. */
export const usdAmount = {
  validator: isWholeCents,
  message: "{PATH} must have at most two decimal places",
};

/** Mongoose validator: an https URL (ImgBB), or a site-relative path under /images/ (used by the seeded catalog). */
export const imageUrl = {
  validator: (value: string) => /^https:\/\/\S+$/.test(value) || /^\/images\/[\w.-]+$/.test(value),
  message: "{PATH} must be an https URL or a /images/ path",
};

/** Zod: a positive USD amount with at most two decimals, e.g. 49 or 49.99. */
export const usdAmountSchema = z
  .number({ error: "Enter an amount" })
  .positive("Amount must be greater than 0")
  .max(10_000, "Amount must be $10,000 or less")
  .refine(isWholeCents, "Use at most two decimal places");

/** A 24-character hex MongoDB ObjectId. Stricter than Mongoose's `isValidObjectId`, which also accepts any 12-character string. */
export function isObjectIdString(value: unknown): value is string {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

/** Escapes user input for use inside a RegExp, so search text is matched literally. */
export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
