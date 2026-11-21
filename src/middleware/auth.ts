import type { Request, RequestHandler } from "express";
import { isValidObjectId } from "mongoose";
import { AppError } from "../lib/errors.js";
import { isTokenError, verifyAccessToken } from "../lib/jwt.js";
import { UserModel, type UserRole } from "../modules/users/users.model.js";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`. */
      user?: AuthUser;
    }
  }
}

/**
 * Accepts only `Authorization: Bearer <JWT>`; cookies are ignored, which also rules out CSRF on the API.
 * The user is reloaded from the database, so suspensions and role changes apply immediately
 * rather than when the 15-minute token expires.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = /^Bearer\s+(\S+)$/i.exec(req.get("authorization") ?? "")?.[1];
  if (!token) throw new AppError(401, "UNAUTHORIZED", "Authentication required");

  let subject: string | undefined;
  try {
    subject = (await verifyAccessToken(token)).sub;
  } catch (error) {
    if (isTokenError(error)) throw new AppError(401, "UNAUTHORIZED", "Invalid or expired token");
    throw error;
  }
  if (!subject || !isValidObjectId(subject)) throw new AppError(401, "UNAUTHORIZED", "Invalid or expired token");

  const user = await UserModel.findById(subject).select("name email role status").lean();
  if (!user) throw new AppError(401, "UNAUTHORIZED", "Invalid or expired token");
  if (user.status === "suspended") throw new AppError(403, "FORBIDDEN", "This account is suspended");

  req.user = { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
  next();
};

/** Use after `requireAuth`. Allows the request only for the listed roles. */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, "FORBIDDEN", "You do not have permission to perform this action");
    }
    next();
  };
}

/** The signed-in user for a route behind `requireAuth`. */
export function authUser(req: Request): AuthUser {
  if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  return req.user;
}
