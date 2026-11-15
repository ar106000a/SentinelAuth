import { Context, Next } from "hono";
import { ForbiddenError } from "../utils/error";
import { env } from "../config/env";

/**
 * Validates request Origin against the authenticated tenant's allowedOrigins.
 * Runs AFTER tenantContext in body mode (REQ_BODY_TOKENS=true).
 *
 * - Non-browser requests without Origin header: allowed.
 * - Allowed origin: sets uncredentialed CORS headers and proceeds.
 * - Disallowed origin: rejects with 403 Forbidden before any route handler runs.
 */
export async function tenantOriginGuard(c: Context, next: Next) {
  if (!env.REQ_BODY_TOKENS) {
    await next();
    return;
  }

  const origin = c.req.header("Origin");
  if (!origin) {
    // Non-browser / server-to-server requests without Origin header are allowed
    await next();
    return;
  }

  const tenantSettings = c.get("tenantSettings") as
    | { allowedOrigins?: string[] }
    | undefined;

  const allowedOrigins = tenantSettings?.allowedOrigins ?? [];

  if (!allowedOrigins.includes(origin)) {
    throw new ForbiddenError(`Origin ${origin} is not allowed for this tenant`);
  }

  // Set uncredentialed CORS headers
  c.header("Access-Control-Allow-Origin", origin);
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-User-Token"
  );
  c.header(
    "Access-Control-Expose-Headers",
    "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset"
  );

  await next();
}

