import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { APIError } from "better-auth/api";
import { jwt } from "better-auth/plugins/jwt";
import { env } from "../config/env.js";
import { getNativeClient, getNativeDb } from "../db/client.js";
import { USER_ROLES, USER_STATUSES, UserModel, type UserRole } from "../modules/users/users.model.js";

/** Account types a visitor may choose at sign-up. Admin accounts are only created by the seed script. */
const SELF_SERVICE_ROLES = ["customer", "technician"] as const satisfies readonly UserRole[];

/**
 * Endpoints that would write user data without the API's validation. Profile edits go through
 * PATCH /api/users/me instead (a later phase); social sign-in and account deletion are not offered.
 */
const DISABLED_AUTH_PATHS = [
  "/update-user",
  "/change-email",
  "/delete-user",
  "/delete-user/callback",
  "/update-session",
  "/link-social",
  "/unlink-account",
  "/sign-in/social",
];

function resolveSignUpRole(body: unknown): UserRole {
  const accountType = typeof body === "object" && body !== null && "accountType" in body ? body.accountType : undefined;
  if (accountType === undefined) return "customer";
  if (SELF_SERVICE_ROLES.some((role) => role === accountType)) return accountType as UserRole;
  throw new APIError("BAD_REQUEST", { message: "accountType must be customer or technician" });
}

function createAuth() {
  return betterAuth({
    appName: "FixMate",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.CLIENT_ORIGINS,
    database: mongodbAdapter(getNativeDb(), { client: getNativeClient() }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    // Share the `users` collection with the Mongoose model instead of creating a separate `user` collection.
    user: {
      modelName: "users",
      additionalFields: {
        // `input: false`: never settable through sign-up or any auth endpoint. The hook below assigns it.
        role: { type: [...USER_ROLES], required: true, defaultValue: "customer", input: false },
        status: { type: [...USER_STATUSES], required: true, defaultValue: "active", input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    disabledPaths: DISABLED_AUTH_PATHS,
    databaseHooks: {
      user: {
        create: {
          // Better Auth writes to MongoDB directly, bypassing Mongoose validation, so the rules are enforced here.
          before: async (user, context) => {
            const name = user.name.trim();
            if (name.length < 1 || name.length > 80) {
              throw new APIError("BAD_REQUEST", { message: "Name must be between 1 and 80 characters" });
            }
            // Only email sign-up may request the technician role. Every other path creates a customer;
            // the seed script promotes its admin account afterwards.
            const role = context?.path === "/sign-up/email" ? resolveSignUpRole(context.body) : "customer";
            return { data: { ...user, name, role, status: "active" } };
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await UserModel.findById(session.userId).select("status").lean();
            if (user?.status === "suspended") {
              throw new APIError("FORBIDDEN", { message: "This account is suspended" });
            }
          },
        },
      },
    },
    plugins: [
      jwt({
        jwks: { keyPairConfig: { alg: "EdDSA", crv: "Ed25519" } },
        jwt: {
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
          expirationTime: "15m",
          definePayload: ({ user }) => ({ role: user.role, email: user.email }),
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let auth: Auth | undefined;

/** Creates the auth instance. Call once, after the database is connected (the adapter needs the live handle). */
export function initAuth() {
  auth ??= createAuth();
  return auth;
}

export function getAuth() {
  if (!auth) throw new Error("Auth is not initialised; call initAuth() after connecting to the database");
  return auth;
}
