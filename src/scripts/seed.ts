import { env, isProduction } from "../config/env.js";
import { connectDatabase, disconnectDatabase } from "../db/client.js";
import { ensureIndexes } from "../db/indexes.js";
import type { Types } from "mongoose";
import { initAuth } from "../lib/auth.js";
import { ServiceModel } from "../modules/services/services.model.js";
import { UserModel } from "../modules/users/users.model.js";
import { seedServices, seedTechnicians } from "./seed-data.js";

/**
 * Creates the admin account from ADMIN_EMAIL / ADMIN_PASSWORD. Public sign-up can never create an admin.
 * Idempotent: an existing admin keeps its current password; an existing non-admin account is never promoted.
 */
async function seedAdmin() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set; skipping the admin account");
    return;
  }
  const email = env.ADMIN_EMAIL.toLowerCase();
  const ctx = await initAuth().$context;

  let admin = await UserModel.findOne({ email });
  if (admin && admin.role !== "admin") {
    throw new Error(`${email} already belongs to a ${admin.role} account; refusing to promote it to admin`);
  }
  if (!admin) {
    // Created through Better Auth so the document matches what sign-up produces; the create hook
    // always assigns "customer", so the role is set directly afterwards.
    const created = await ctx.internalAdapter.createUser({ email, name: "FixMate Admin", emailVerified: true }, { method: "admin" });
    admin = await UserModel.findByIdAndUpdate(created.id, { role: "admin", status: "active" }, { returnDocument: "after" });
    if (!admin) throw new Error("Admin account was not found after creation");
  }

  const adminId = admin._id.toString();
  const accounts = await ctx.internalAdapter.findAccounts(adminId);
  if (accounts.some((account) => account.providerId === "credential")) {
    console.log(`Admin account ${email} already exists; password unchanged`);
    return;
  }
  await ctx.internalAdapter.linkAccount({
    userId: adminId,
    providerId: "credential",
    accountId: adminId,
    password: await ctx.password.hash(env.ADMIN_PASSWORD),
  });
  console.log(`Admin account ${email} is ready`);
}

/**
 * Seeds the admin account and the demo catalog: sample technician profiles and their approved services.
 * Idempotent: re-running updates existing records instead of duplicating them.
 * The sample technicians have no credentials, so they cannot sign in.
 */
async function seed() {
  if (isProduction && !process.argv.includes("--allow-production")) {
    throw new Error("Refusing to seed demo data in production (pass --allow-production to override)");
  }

  await connectDatabase();
  await ensureIndexes();
  await seedAdmin();

  const technicianIds = new Map<string, Types.ObjectId>();
  for (const technician of seedTechnicians) {
    const user =
      (await UserModel.findOne({ email: technician.email })) ??
      new UserModel({ email: technician.email, emailVerified: false });

    if (user.role === "admin") {
      throw new Error(`Seed email ${technician.email} belongs to an admin account; aborting`);
    }

    user.set({ name: technician.name, role: "technician", bio: technician.bio, status: "active" });
    await user.save();
    technicianIds.set(technician.key, user._id);
  }

  let created = 0;
  let updated = 0;
  for (const { technicianKey, ...fields } of seedServices) {
    const technicianId = technicianIds.get(technicianKey);
    const existing = await ServiceModel.findOne({ technicianId, title: fields.title });
    const service = existing ?? new ServiceModel({ technicianId });

    service.set({ ...fields, approvalStatus: "approved", rejectionReason: undefined, isActive: true });
    await service.save();
    if (existing) updated += 1;
    else created += 1;
  }

  console.log(`Seeded ${technicianIds.size} sample technicians; services created: ${created}, updated: ${updated}`);
}

seed()
  .catch((error: unknown) => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
