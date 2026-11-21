import { existsSync } from "node:fs";
import { z } from "zod";

// Load .env in local development. Hosting platforms inject real environment variables instead.
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const originList = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url({ protocol: /^https?$/ })).min(1, "At least one client origin is required"));

/** Treats an empty value (e.g. `ADMIN_EMAIL=` in .env) as unset. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  CLIENT_ORIGINS: originList,
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, "Must be a mongodb:// or mongodb+srv:// connection string"),
  // Optional, comma-separated (e.g. "8.8.8.8,1.1.1.1"). For machines whose local DNS refuses the SRV lookup
  // that mongodb+srv:// connection strings need. Leave unset on hosting platforms.
  DNS_SERVERS: optional(
    z
      .string()
      .transform((value) => value.split(",").map((server) => server.trim()).filter(Boolean))
      .pipe(z.array(z.ipv4()).min(1)),
  ),
  MONGODB_DB_NAME: z.string().regex(/^[A-Za-z0-9_-]{1,38}$/, "Invalid database name").default("fixmate"),
  BETTER_AUTH_SECRET: z.string().min(32, "Must be at least 32 characters (generate with: openssl rand -base64 32)"),
  // The public origin the browser uses. Because Next.js proxies /api/*, this is the frontend's origin.
  BETTER_AUTH_URL: z.url({ protocol: /^https?$/ }),
  JWT_ISSUER: optional(z.string().min(1)),
  JWT_AUDIENCE: z.string().min(1).default("fixmate-api"),
  // Stripe (test mode). Payments return 503 without the secret key; the webhook needs its signing secret.
  STRIPE_SECRET_KEY: optional(z.string().regex(/^sk_(test|live)_/, "Must be a Stripe secret key (sk_test_...)")),
  STRIPE_WEBHOOK_SECRET: optional(z.string().regex(/^whsec_/, "Must be a Stripe webhook signing secret (whsec_...)")),
  // Where Stripe sends customers back after Checkout. Defaults to BETTER_AUTH_URL (the frontend origin).
  CLIENT_URL: optional(z.url({ protocol: /^https?$/ })),
  // ImgBB API key for service images and profile photos (https://api.imgbb.com). Uploads return 503 without it.
  IMGBB_API_KEY: optional(z.string().min(10)),
  // Only used by the seed script to create the admin account.
  ADMIN_EMAIL: optional(z.email()),
  ADMIN_PASSWORD: optional(z.string().min(12, "Must be at least 12 characters").max(128)),
  // Shared password of the seeded technician and customer test accounts.
  SEED_USER_PASSWORD: optional(
    z
      .string()
      .min(8, "Must be at least 8 characters")
      .max(128)
      .regex(/[A-Z]/, "Must contain an uppercase letter")
      .regex(/[a-z]/, "Must contain a lowercase letter"),
  ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a readable list of problems instead of starting with a broken configuration.
  console.error("Invalid environment configuration:\n" + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  // Better Auth's JWT plugin also defaults the issuer to its base URL; both sides must agree.
  JWT_ISSUER: parsed.data.JWT_ISSUER ?? parsed.data.BETTER_AUTH_URL,
  CLIENT_URL: (parsed.data.CLIENT_URL ?? parsed.data.BETTER_AUTH_URL).replace(/\/+$/, ""),
};
export const isProduction = env.NODE_ENV === "production";
