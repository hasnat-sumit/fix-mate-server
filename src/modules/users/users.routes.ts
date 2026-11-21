import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../lib/errors.js";
import { authUser, verifyToken } from "../../middleware/auth.js";
import { ServiceModel } from "../services/services.model.js";
import { UserModel } from "./users.model.js";

export const usersRouter = Router();

const PROFILE_FIELDS = "name email emailVerified image role phone area bio status createdAt";

/** Empty strings clear optional fields. Email, role and status are read-only here. */
const updateProfileBody = z
  .strictObject({
    name: z.string().trim().min(1, "Enter your name").max(80),
    phone: z.union([z.literal(""), z.string().trim().regex(/^\+?[0-9\s()-]{7,20}$/, "Enter a valid phone number")]),
    area: z.string().trim().max(80),
    bio: z.string().trim().max(500),
    /** Profile photo uploaded through ImgBB. */
    image: z.union([z.literal(""), z.url({ protocol: /^https$/, error: "Upload a profile photo" }).max(2048)]),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Provide at least one field to update");

async function findProfile(id: string) {
  const user = await UserModel.findById(id).select(PROFILE_FIELDS).lean();
  if (!user) throw new AppError(404, "NOT_FOUND", "User not found");
  return { ...user, image: user.image ?? null, phone: user.phone ?? "", area: user.area ?? "", bio: user.bio ?? "" };
}

// GET /api/users/profile — the signed-in user's own profile.
usersRouter.get("/profile", verifyToken, async (req, res) => {
  res.json({ success: true, data: await findProfile(authUser(req).id) });
});

// PATCH /api/users/profile — name, phone, area, bio and photo. The only profile edit path:
// Better Auth's update-user endpoint is disabled (see lib/auth.ts). The session reads the user
// document, so the new name and photo show up in the navbar on the next session fetch.
usersRouter.patch("/profile", verifyToken, async (req, res) => {
  const body = updateProfileBody.parse(req.body);
  const $set: Record<string, string> = {};
  const $unset: Record<string, ""> = {};
  for (const [field, value] of Object.entries(body)) {
    if (value === "" && field !== "name") $unset[field] = "";
    else $set[field] = value;
  }
  const user = authUser(req);
  await UserModel.updateOne({ _id: user.id }, { $set, $unset }, { runValidators: true });
  // Services carry a copy of the technician's name; keep it current. Bookings keep the name they were made with.
  if (body.name && user.role === "technician") {
    await ServiceModel.updateMany({ technicianEmail: user.email }, { $set: { technicianName: body.name } });
  }
  res.json({ success: true, data: await findProfile(user.id) });
});
