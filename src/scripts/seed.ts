import { env, isProduction } from "../config/env.js";
import { connectDatabase, disconnectDatabase, getNativeDb } from "../db/client.js";
import { ensureIndexes } from "../db/indexes.js";
import { initAuth } from "../lib/auth.js";
import { BookingModel, isActiveBookingStatus } from "../modules/bookings/bookings.model.js";
import { PaymentModel } from "../modules/payments/payments.model.js";
import { ServiceModel } from "../modules/services/services.model.js";
import { UserModel, type UserRole } from "../modules/users/users.model.js";
import { seedBookings, seedCustomers, seedServices, seedTechnicians, type SeedUser } from "./seed-data.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number, hour = 10) => {
  const date = new Date(Date.now() - days * DAY_MS);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
};
/** UTC midnight `days` from today (negative = past), the way bookings store preferredDate. */
const calendarDay = (days: number) => new Date(`${new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10)}T00:00:00Z`);

/** Sample technicians from an earlier version of the seed. They never had passwords. */
const LEGACY_SEED_EMAILS = [
  "amira.chen@example.com",
  "daniel.foster@example.com",
  "rafiq.hasan@example.com",
  "priya.nair@example.com",
  "mateo.alvarez@example.com",
  "grace.okafor@example.com",
];

/**
 * Removes documents written by earlier schema versions (before services/bookings/payments matched the spec).
 * Runs before the indexes are synced, because old documents can collide with the new unique indexes.
 */
async function removeLegacyData() {
  const db = getNativeDb();
  const [services, bookings, payments] = await Promise.all([
    db.collection("services").deleteMany({ technicianEmail: { $exists: false } }),
    db.collection("bookings").deleteMany({ customerEmail: { $exists: false } }),
    db.collection("payments").deleteMany({ stripeSessionId: { $exists: false } }),
  ]);

  let users = 0;
  for (const email of LEGACY_SEED_EMAILS) {
    const user = await UserModel.findOne({ email }).select("_id").lean();
    if (!user) continue;
    const hasLogin = await db.collection("account").countDocuments({ userId: user._id });
    if (hasLogin === 0) {
      await UserModel.deleteOne({ _id: user._id });
      users += 1;
    }
  }

  const removed = services.deletedCount + bookings.deletedCount + payments.deletedCount + users;
  if (removed > 0) {
    console.log(
      `Removed legacy data: ${services.deletedCount} services, ${bookings.deletedCount} bookings, ` +
        `${payments.deletedCount} payments, ${users} sample users`,
    );
  }
}

/**
 * Creates (or updates) an email/password account through Better Auth, so it matches what sign-up produces.
 * The sign-up hook always assigns "customer" outside /sign-up/email, so the role is set directly afterwards.
 */
async function upsertAccount(
  profile: Pick<SeedUser, "name" | "email"> & Partial<SeedUser>,
  role: UserRole,
  password: string,
  { resetPassword }: { resetPassword: boolean },
) {
  const ctx = await initAuth().$context;
  const email = profile.email.toLowerCase();

  let user = await UserModel.findOne({ email });
  if (user && user.role === "admin" && role !== "admin") {
    throw new Error(`${email} belongs to an admin account; refusing to change it`);
  }
  if (user && role === "admin" && user.role !== "admin") {
    throw new Error(`${email} already belongs to a ${user.role} account; refusing to promote it to admin`);
  }
  if (!user) {
    const created = await ctx.internalAdapter.createUser({ email, name: profile.name, emailVerified: true }, { method: "admin" });
    user = await UserModel.findById(created.id);
    if (!user) throw new Error(`Account ${email} was not found after creation`);
  }

  user.set({
    name: profile.name,
    role,
    status: "active",
    ...(profile.phone ? { phone: profile.phone } : {}),
    ...(profile.area ? { area: profile.area } : {}),
    ...(profile.bio ? { bio: profile.bio } : {}),
  });
  await user.save();

  const userId = user._id.toString();
  const accounts = await ctx.internalAdapter.findAccounts(userId);
  const hash = await ctx.password.hash(password);
  if (!accounts.some((account) => account.providerId === "credential")) {
    await ctx.internalAdapter.linkAccount({ userId, providerId: "credential", accountId: userId, password: hash });
  } else if (resetPassword) {
    await ctx.internalAdapter.updatePassword(userId, hash);
  }
  return user;
}

/** The admin account from ADMIN_EMAIL / ADMIN_PASSWORD. Public sign-up can never create an admin. */
async function seedAdmin() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.log("ADMIN_EMAIL / ADMIN_PASSWORD not set; skipping the admin account");
    return;
  }
  // An existing admin keeps its current password, so a re-run never undoes a password change,
  // unless `--reset-admin-password` asks to set it to ADMIN_PASSWORD.
  const resetPassword = process.argv.includes("--reset-admin-password");
  await upsertAccount({ name: "FixMate Admin", email: env.ADMIN_EMAIL }, "admin", env.ADMIN_PASSWORD, { resetPassword });
  console.log(`Admin account ${env.ADMIN_EMAIL} is ready${resetPassword ? " (password reset to ADMIN_PASSWORD)" : ""}`);
}

/** Technician and customer test accounts, all sharing SEED_USER_PASSWORD. */
async function seedUsers() {
  if (!env.SEED_USER_PASSWORD) throw new Error("Set SEED_USER_PASSWORD in .env to create the demo accounts");
  const options = { resetPassword: true };
  for (const technician of seedTechnicians) await upsertAccount(technician, "technician", env.SEED_USER_PASSWORD, options);
  for (const customer of seedCustomers) await upsertAccount(customer, "customer", env.SEED_USER_PASSWORD, options);
}

/** Upserts services by (technicianEmail, title), so their ids stay stable across re-runs. Returns key → service. */
async function seedServiceCatalog() {
  const technicians = new Map(seedTechnicians.map((technician) => [technician.key, technician]));
  const services = new Map<string, InstanceType<typeof ServiceModel>>();

  for (const { key, technician: technicianKey, createdDaysAgo, ...fields } of seedServices) {
    const technician = technicians.get(technicianKey)!;
    const service =
      (await ServiceModel.findOne({ technicianEmail: technician.email, title: fields.title })) ??
      new ServiceModel({ createdAt: daysAgo(createdDaysAgo) });
    service.set({ ...fields, technicianName: technician.name, technicianEmail: technician.email, isAvailable: true });
    await service.save();
    services.set(key, service);
  }
  return services;
}

/** Replaces the demo customers' bookings and payments with a fresh set covering every status. */
async function seedJobs(services: Map<string, InstanceType<typeof ServiceModel>>) {
  const customers = new Map(seedCustomers.map((customer) => [customer.key, customer]));
  const customerEmails = seedCustomers.map((customer) => customer.email);
  await Promise.all([
    BookingModel.deleteMany({ customerEmail: { $in: customerEmails } }),
    PaymentModel.deleteMany({ customerEmail: { $in: customerEmails } }),
  ]);

  let paymentCount = 0;
  for (const [index, seed] of seedBookings.entries()) {
    const service = services.get(seed.service)!;
    const customer = customers.get(seed.customer)!;
    const status = seed.path.at(-1)!;
    const createdAt = daysAgo(seed.createdDaysAgo);
    // Status changes are spread over the following hours/days, ending before now.
    const changedAt = (step: number) =>
      new Date(Math.min(createdAt.getTime() + step * Math.max(seed.createdDaysAgo, 1) * 0.2 * DAY_MS, Date.now() - (5 - step) * 60_000));
    const statusHistory: { status: string; changedAt: Date }[] = seed.path.map((pathStatus, step) => ({ status: pathStatus, changedAt: changedAt(step) }));
    const paidAt = seed.paid ? changedAt(seed.path.length) : undefined;
    if (paidAt) statusHistory.push({ status: "paid", changedAt: paidAt });

    const booking = await BookingModel.create({
      serviceId: service.id as string,
      serviceTitle: service.title,
      serviceImage: service.image,
      category: service.category,
      basePrice: service.basePrice,
      technicianName: service.technicianName,
      technicianEmail: service.technicianEmail,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      address: seed.address,
      preferredDate: calendarDay(seed.preferredInDays),
      problemDescription: seed.problemDescription,
      status,
      isActive: isActiveBookingStatus(status),
      finalAmount: seed.finalAmount ?? service.basePrice,
      paymentStatus: seed.paid ? "paid" : "unpaid",
      statusHistory,
      ...(seed.rating ? { rating: seed.rating, review: seed.review ?? "", reviewedAt: paidAt } : {}),
      createdAt,
    });

    if (seed.paid && paidAt) {
      // Clearly marked demo identifiers: these were never real Stripe objects.
      const ref = String(index + 1).padStart(3, "0");
      await PaymentModel.create({
        bookingId: booking.id as string,
        serviceTitle: booking.serviceTitle,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        technicianName: booking.technicianName,
        technicianEmail: booking.technicianEmail,
        amount: booking.finalAmount,
        currency: "usd",
        transactionId: `pi_demo_seed_${ref}`,
        stripeSessionId: `cs_demo_seed_${ref}`,
        paymentStatus: "paid",
        paidAt,
      });
      paymentCount += 1;
    }
  }
  return { bookings: seedBookings.length, payments: paymentCount };
}

/**
 * Seeds the admin, demo technicians and customers, the service catalog, and bookings in every status.
 * Idempotent: re-running updates accounts and services in place and recreates the demo bookings.
 */
async function seed() {
  if (isProduction && !process.argv.includes("--allow-production")) {
    throw new Error("Refusing to seed demo data in production (pass --allow-production to override)");
  }

  await connectDatabase();
  await removeLegacyData();
  await ensureIndexes();
  await seedAdmin();
  await seedUsers();
  const services = await seedServiceCatalog();
  const jobs = await seedJobs(services);

  const approved = seedServices.filter((service) => service.approvalStatus === "approved").length;
  console.log(
    `Seeded ${seedTechnicians.length} technicians, ${seedCustomers.length} customers, ` +
      `${services.size} services (${approved} approved), ${jobs.bookings} bookings and ${jobs.payments} payments`,
  );
  console.log("Test accounts (password: SEED_USER_PASSWORD):");
  for (const user of [...seedTechnicians, ...seedCustomers]) console.log(`  ${user.email}`);
}

seed()
  .catch((error: unknown) => {
    console.error("Seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
