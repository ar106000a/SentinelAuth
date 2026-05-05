import { Context } from "hono";
import { ContentfulStatusCode } from "hono/utils/http-status";
export function successResponse<T>(
  c: Context,
  data: T,
  statusCode: ContentfulStatusCode = 200
) {
  return c.json(
    {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    },
    statusCode
  );
}
export function errorResponse(
  c: Context,
  message: string,
  statusCode: ContentfulStatusCode = 500,
  code: string = "INTERNAL_ERROR"
) {
  return c.json(
    {
      success: false,
      error: { message, code },
      timestamp: new Date().toISOString(),
    },
    statusCode
  );
}
