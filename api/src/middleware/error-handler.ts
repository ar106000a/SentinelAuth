import { Context, Next } from "hono";
import { AppError } from "../utils/error";
import { errorResponse } from "../utils/response";

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(c, error.message, error.statusCode, error.code);
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "23505"
    ) {
      return errorResponse(c, "Resource already exists", 409, "CONFLICT");
    }

    console.error("unhandled error:", error);
    return errorResponse(c, "Internal server error", 500, "INTERNAL_ERROR");
  }
}
