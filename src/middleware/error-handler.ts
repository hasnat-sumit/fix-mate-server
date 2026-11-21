import type { ErrorRequestHandler, RequestHandler } from "express";
import { z } from "zod";
import { isProduction } from "../config/env.js";
import { AppError, isDuplicateKeyError, type ErrorCode } from "../lib/errors.js";

type ErrorBody = {
  success: false;
  code: ErrorCode;
  message: string;
  details?: unknown;
};

/** Errors raised by Express's body parser carry an HTTP status and a `type`. */
function isBodyParserError(error: unknown): error is { status: number; type: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "type" in error &&
    typeof error.status === "number" &&
    typeof error.type === "string"
  );
}

function toResponse(error: unknown): { status: number; body: ErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      body: { success: false, code: error.code, message: error.message, details: error.details },
    };
  }

  if (error instanceof z.ZodError) {
    return {
      status: 400,
      body: { success: false, code: "VALIDATION_ERROR", message: "Invalid request data", details: z.flattenError(error) },
    };
  }

  // Routes translate expected duplicates into specific messages; this is the generic fallback.
  if (isDuplicateKeyError(error)) {
    return { status: 409, body: { success: false, code: "CONFLICT", message: "This record already exists" } };
  }

  if (isBodyParserError(error)) {
    if (error.type === "entity.too.large") {
      return { status: 413, body: { success: false, code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" } };
    }
    if (error.type === "entity.parse.failed") {
      return { status: 400, body: { success: false, code: "BAD_REQUEST", message: "Malformed JSON body" } };
    }
  }

  return { status: 500, body: { success: false, code: "INTERNAL_ERROR", message: "Something went wrong" } };
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, "NOT_FOUND", `Route not found: ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const { status, body } = toResponse(error);

  if (status >= 500) {
    // Unexpected failures are logged in full on the server but never leaked to the client.
    console.error(`[${req.method} ${req.originalUrl}]`, error);
  }

  if (!isProduction && status >= 500 && error instanceof Error) {
    body.details = { message: error.message };
  }

  res.status(status).json(body);
};
