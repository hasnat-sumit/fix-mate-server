import { z } from "zod";
import { SERVICE_CATEGORIES } from "./services.model.js";

export const SERVICE_SORTS = ["featured", "price-asc", "price-desc", "newest"] as const;

export const listServicesQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(SERVICE_CATEGORIES).optional(),
  sort: z.enum(SERVICE_SORTS).default("featured"),
  featured: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(24).default(8),
});

const editableFields = {
  title: z.string().trim().min(3).max(100),
  category: z.enum(SERVICE_CATEGORIES),
  description: z.string().trim().min(10).max(200),
  details: z.string().trim().max(2000),
  /** Starting price in cents (USD): $1 to $10,000. */
  price: z.number().int("Price must be a whole number of cents").min(100).max(1_000_000),
  // Technicians supply an https image URL. Site-relative /images/ paths are reserved for the seeded catalog.
  image: z.url({ protocol: /^https$/, error: "Image must be an https URL" }).max(2048),
  includes: z.array(z.string().trim().min(1).max(100)).max(10),
  availability: z.string().trim().max(120),
};

/** Unknown fields are rejected, so approval status, featured flag and ratings can never be set by a technician. */
export const createServiceBody = z.strictObject({
  ...editableFields,
  details: editableFields.details.default(""),
  includes: editableFields.includes.default([]),
  availability: editableFields.availability.default(""),
});

export const updateServiceBody = z
  .strictObject({ ...editableFields, isActive: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");
