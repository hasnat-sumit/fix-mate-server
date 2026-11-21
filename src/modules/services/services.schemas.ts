import { z } from "zod";
import { usdAmountSchema } from "../../lib/validators.js";
import { SERVICE_CATEGORIES, SERVICE_MODES } from "./services.model.js";

export const SERVICE_SORTS = ["newest", "price-asc", "price-desc"] as const;

export const listServicesQuery = z.object({
  /** Matches the title or the category. */
  search: z.string().trim().max(100).optional(),
  category: z.enum(SERVICE_CATEGORIES).optional(),
  serviceMode: z.enum(SERVICE_MODES).optional(),
  sort: z.enum(SERVICE_SORTS).default("newest"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(24).default(12),
});

const editableFields = {
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(100),
  category: z.enum(SERVICE_CATEGORIES, { error: "Choose a category" }),
  description: z.string().trim().min(20, "Description must be at least 20 characters").max(2000),
  basePrice: usdAmountSchema,
  estimatedDuration: z.string().trim().min(1, "Enter an estimated duration").max(50),
  serviceMode: z.enum(SERVICE_MODES, { error: "Choose Home Visit or Shop Drop-off" }),
  serviceArea: z.string().trim().min(2, "Enter the area you cover").max(100),
  // Uploaded through ImgBB, so it is always an https URL. Site-relative /images/ paths are reserved for the seeded catalog.
  image: z.url({ protocol: /^https$/, error: "Upload a service image" }).max(2048),
};

/**
 * Unknown fields are rejected, so approval status and the technician's identity can never be set by the client:
 * technicianName/technicianEmail come from the session, approvalStatus starts as "pending".
 */
export const createServiceBody = z.strictObject(editableFields);

export const updateServiceBody = z
  .strictObject({ ...editableFields, isAvailable: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");
