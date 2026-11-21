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
      /** Set by `verifyToken`. */
      user?: AuthUser;
    }
  }
}

/**
 * 401 unless the request carries a valid `Authorization: Bearer <JWT>` issued by Better Auth.
 * Cookies are ignored, which also rules out CSRF on the API. The user is reloaded from the database,
 * so suspensions and role changes apply immediately rather than when the 15-minute token expires.
 */
export const verifyToken: RequestHandler = async (req, _res, next) => {
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

/** Use after `verifyToken`: 403 unless the signed-in user has one of the given roles. */
function verifyRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, "FORBIDDEN", "You do not have permission to perform this action");
    }
    next();
  };
}

export const verifyCustomer = verifyRole("customer");
export const verifyTechnician = verifyRole("technician");
export const verifyAdmin = verifyRole("admin");

/** The signed-in user for a route behind `verifyToken`. */
export function authUser(req: Request): AuthUser {
  if (!req.user) throw new AppError(401, "UNAUTHORIZED", "Authentication required");
  return req.user;
}
