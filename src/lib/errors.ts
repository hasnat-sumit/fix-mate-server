export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR";

/** An expected, client-safe error. Its message is always shown to the client. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** MongoDB duplicate-key error (a unique index rejected the write). */
export function isDuplicateKeyError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
