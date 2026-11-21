import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { jwt } from "better-auth/plugins/jwt";
import { env } from "../config/env.js";
import { getNativeClient, getNativeDb } from "../db/client.js";
import { USER_ROLES, USER_STATUSES, UserModel, type UserRole } from "../modules/users/users.model.js";

/** Account types a visitor may choose at sign-up. Admin accounts are only created by the seed script. */
const SELF_SERVICE_ROLES = ["customer", "technician"] as const satisfies readonly UserRole[];

/**
 * Endpoints that would write user data without the API's validation. Profile edits go through
 * PATCH /api/users/profile instead; social sign-in and account deletion are not offered.
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

/**
 * The role chosen at sign-up (`role` in the request body). Anything other than "customer" or
 * "technician" (including "admin") is saved as "customer".
 */
function resolveSignUpRole(body: unknown): UserRole {
  const requested = typeof body === "object" && body !== null && "role" in body ? body.role : undefined;
  return SELF_SERVICE_ROLES.find((role) => role === requested) ?? "customer";
}

export const PASSWORD_RULES = { minLength: 6, maxLength: 128 } as const;

/** At least 6 characters, with an uppercase and a lowercase letter. Returns the first problem, or null. */
export function passwordProblem(password: unknown) {
  if (typeof password !== "string" || password.length < PASSWORD_RULES.minLength) {
    return `Password must be at least ${PASSWORD_RULES.minLength} characters`;
  }
  if (password.length > PASSWORD_RULES.maxLength) return `Password must be at most ${PASSWORD_RULES.maxLength} characters`;
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter";
  return null;
}

/** Endpoints that set a password, and the body field holding it. */
const PASSWORD_FIELDS: Record<string, string> = {
  "/sign-up/email": "password",
  "/change-password": "newPassword",
  "/reset-password": "newPassword",
};

/** Enforces the password rules on the server, whatever the client does. */
const passwordRulesHook = createAuthMiddleware(async (ctx) => {
  const field = PASSWORD_FIELDS[ctx.path];
  if (!field) return;
  const problem = passwordProblem((ctx.body as Record<string, unknown> | undefined)?.[field]);
  if (problem) throw new APIError("BAD_REQUEST", { message: problem });
});

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
      minPasswordLength: PASSWORD_RULES.minLength,
      maxPasswordLength: PASSWORD_RULES.maxLength,
    },
    // Share the `users` collection with the Mongoose model instead of creating a separate `user` collection.
    user: {
      modelName: "users",
      additionalFields: {
        // `input: false` + default: a `role` sent at sign-up is replaced by "customer" here, and the
        // create hook below then applies the chosen role if it is "customer" or "technician".
        role: { type: [...USER_ROLES], required: true, defaultValue: "customer", input: false },
        status: { type: [...USER_STATUSES], required: true, defaultValue: "active", input: false },
        // Profile fields, filled in later through PATCH /api/users/profile (not at sign-up).
        phone: { type: "string", required: false, input: false },
        area: { type: "string", required: false, input: false },
        bio: { type: "string", required: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    disabledPaths: DISABLED_AUTH_PATHS,
    hooks: { before: passwordRulesHook },
    databaseHooks: {
      user: {
        create: {
          // Better Auth writes to MongoDB directly, bypassing Mongoose validation, so the rules are enforced here.
          before: async (user, context) => {
            const name = user.name.trim();
            if (name.length < 1 || name.length > 80) {
              throw new APIError("BAD_REQUEST", { message: "Name must be between 1 and 80 characters" });
            }
            // Only email sign-up may choose the technician role. Every other path creates a customer;
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
