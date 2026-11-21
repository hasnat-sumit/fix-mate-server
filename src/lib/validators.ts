/** Mongoose validator: money is stored as a whole number of cents. */
export const wholeCents = {
  validator: (value: number) => Number.isInteger(value),
  message: "{PATH} must be a whole number of cents",
};

/** Mongoose validator: an https URL, or a site-relative path under /images/ (used by the seeded catalog). */
export const imageUrl = {
  validator: (value: string) => /^https:\/\/\S+$/.test(value) || /^\/images\/[\w.-]+$/.test(value),
  message: "{PATH} must be an https URL or a /images/ path",
};

/** A 24-character hex MongoDB ObjectId. Stricter than Mongoose's `isValidObjectId`, which also accepts any 12-character string. */
export function isObjectIdString(value: unknown): value is string {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

/** Escapes user input for use inside a RegExp, so search text is matched literally. */
export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
