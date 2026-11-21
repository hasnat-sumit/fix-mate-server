import { model, Schema, type InferSchemaType } from "mongoose";
import { imageUrl, wholeCents } from "../../lib/validators.js";

/** Keep in sync with `serviceCategories` in the frontend's src/data/service-categories.ts. */
export const SERVICE_CATEGORIES = [
  "Smartphone",
  "Laptop & PC",
  "Air Conditioning",
  "Home Appliances",
  "Television",
  "Electrical Services",
  "Other Repairs",
] as const;

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;

const serviceSchema = new Schema(
  {
    technicianId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
    category: { type: String, enum: SERVICE_CATEGORIES, required: true },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 200 },
    details: { type: String, trim: true, maxlength: 2000, default: "" },
    /** Starting price in cents (USD). */
    price: { type: Number, required: true, min: 100, max: 1_000_000, validate: wholeCents },
    image: { type: String, required: true, trim: true, validate: imageUrl },
    includes: {
      type: [{ type: String, trim: true, maxlength: 100 }],
      default: [],
      validate: { validator: (items: string[]) => items.length <= 10, message: "At most 10 included items" },
    },
    availability: { type: String, trim: true, maxlength: 120, default: "" },
    approvalStatus: { type: String, enum: APPROVAL_STATUSES, required: true, default: "pending" },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 500,
      required: [
        function (this: { approvalStatus?: string }) {
          return this.approvalStatus === "rejected";
        },
        "A rejection reason is required",
      ],
    },
    /** The technician can hide a service without deleting it. */
    isActive: { type: Boolean, required: true, default: true },
    /** Admin-controlled flag for the homepage's featured services. */
    isFeatured: { type: Boolean, required: true, default: false },
    /** Real aggregates, recalculated from booking reviews (phase B6). Never seeded with invented values. */
    ratingAverage: { type: Number, min: 0, max: 5, default: 0 },
    reviewCount: { type: Number, min: 0, default: 0 },
  },
  { collection: "services", timestamps: true },
);

serviceSchema.index({ technicianId: 1 });
serviceSchema.index({ approvalStatus: 1, isActive: 1, category: 1, price: 1 });

export type Service = InferSchemaType<typeof serviceSchema>;
export const ServiceModel = model("Service", serviceSchema);
