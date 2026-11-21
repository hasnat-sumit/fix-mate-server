import { model, Schema, type InferSchemaType } from "mongoose";

export const USER_ROLES = ["customer", "technician", "admin"] as const;
export const USER_STATUSES = ["active", "suspended"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * The `users` collection is shared with Better Auth (configured with `user.modelName: "users"` in phase B3).
 * Better Auth creates these documents and owns the auth fields; the API only edits profile fields and `status`.
 */
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    emailVerified: { type: Boolean, required: true, default: false },
    image: { type: String, default: null },
    role: { type: String, enum: USER_ROLES, required: true, default: "customer" },
    phone: { type: String, trim: true, match: [/^\+?[0-9\s()-]{7,20}$/, "Invalid phone number"] },
    area: { type: String, trim: true, maxlength: 80 },
    bio: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: USER_STATUSES, required: true, default: "active" },
  },
  // No version key: Better Auth writes these documents too and does not maintain one.
  { collection: "users", timestamps: true, versionKey: false },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, status: 1 });

export type User = InferSchemaType<typeof userSchema>;
export const UserModel = model("User", userSchema);
