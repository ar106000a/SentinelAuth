import { Context, Next } from "hono";
import { AppError } from "../utils/error";
import { errorResponse } from "../utils/response";

export async function errorHandler(c: Context, next: Next) {
  try {
    return await next();
  } catch (error) {
    if (error instanceof AppError) {
      return errorResponse(c, error.message, error.statusCode, error.code);
    }

    //ducktyping for test debugging
    if (error && typeof error === "object" && "statusCode" in error) {
      return errorResponse(
        c,
        (error as any).message,
        (error as any).statusCode,
        (error as any).code
      );
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
