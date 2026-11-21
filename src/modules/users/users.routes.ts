import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { authUser, requireAuth } from "../../middleware/auth.js";
import { UserModel } from "./users.model.js";

export const usersRouter = Router();

const PROFILE_FIELDS = "name email emailVerified image role phone area bio status createdAt";

/** Empty strings clear optional fields. Email, role and status are not editable here. */
const updateProfileBody = z
  .strictObject({
    name: z.string().trim().min(1, "Enter your name").max(80),
    phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9\s()-]{7,20}$/, "Enter a valid phone number")]),
    area: z.string().trim().max(80),
    bio: z.string().trim().max(500),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

async function findProfile(id: string) {
  const user = await UserModel.findById(id).select(PROFILE_FIELDS).lean();
  if (!user) throw new AppError(404, "NOT_FOUND", "User not found");
  const { _id, ...profile } = user;
  return { id: _id.toString(), ...profile, phone: profile.phone ?? "", area: profile.area ?? "", bio: profile.bio ?? "" };
}

usersRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ success: true, data: await findProfile(authUser(req).id) });
});

// The only profile edit path: Better Auth's update-user endpoint is disabled (see lib/auth.ts).
usersRouter.patch("/me", requireAuth, async (req, res) => {
  const body = updateProfileBody.parse(req.body);
  const $set: Record<string, string> = {};
  const $unset: Record<string, ""> = {};
  for (const [field, value] of Object.entries(body)) {
    if (value === "" && field !== "name") $unset[field] = "";
    else $set[field] = value;
  }
  await UserModel.updateOne({ _id: authUser(req).id }, { $set, $unset }, { runValidators: true });
  res.json({ success: true, data: await findProfile(authUser(req).id) });
});
