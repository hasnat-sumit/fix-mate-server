import { model, Schema, type InferSchemaType } from "mongoose";
import { imageUrl, usdAmount } from "../../lib/validators.js";

/** Keep in sync with the frontend's src/data/service-categories.ts. */
export const SERVICE_CATEGORIES = [
  "Smartphone",
  "Laptop & PC",
  "AC",
  "Refrigerator",
  "TV",
  "Washing Machine",
  "Electrical",
] as const;

export const SERVICE_MODES = ["Home Visit", "Shop Drop-off"] as const;
export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

/**
 * A repair service offered by a technician. The owner is linked by `technicianEmail` (= users.email);
 * the technician's name is copied in so listings never need a join.
 */
const serviceSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
    category: { type: String, enum: SERVICE_CATEGORIES, required: true },
    description: { type: String, required: true, trim: true, minlength: 20, maxlength: 2000 },
    /** Service banner (ImgBB URL). */
    image: { type: String, required: true, trim: true, validate: imageUrl },
    /** Starting price in USD, shown on cards. */
    basePrice: { type: Number, required: true, min: 1, max: 10_000, validate: usdAmount },
    estimatedDuration: { type: String, required: true, trim: true, maxlength: 50 },
    serviceMode: { type: String, enum: SERVICE_MODES, required: true },
    serviceArea: { type: String, required: true, trim: true, maxlength: 100 },
    technicianName: { type: String, required: true, trim: true },
    technicianEmail: { type: String, required: true, trim: true, lowercase: true },
    approvalStatus: { type: String, enum: APPROVAL_STATUSES, required: true, default: "pending" },
    /** The technician can turn the service on/off without deleting it. */
    isAvailable: { type: Boolean, required: true, default: true },
  },
  { collection: "services", timestamps: true, versionKey: false },
);

serviceSchema.index({ technicianEmail: 1, createdAt: -1 });
// Public catalog: approved + available, filtered by category/mode and sorted by price or date.
serviceSchema.index({ approvalStatus: 1, isAvailable: 1, category: 1, basePrice: 1 });
serviceSchema.index({ approvalStatus: 1, isAvailable: 1, createdAt: -1 });

export type Service = InferSchemaType<typeof serviceSchema>;
export const ServiceModel = model("Service", serviceSchema);
