import "./config/env"; // must be first — validates all env vars
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { Context, Next } from "hono";
import { errorHandler } from "./middleware/error-handler";
import { errorResponse, successResponse } from "./utils/response";
import { AppError } from "./utils/error";
import { preAuthRateLimit, tenantRateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import {
  DEFAULT_RATE_LIMIT,
  AUTH_RATE_LIMIT,
  MAINT_RATE_LIMIT,
  RateLimitConfig,
} from "./lib/rate-limiter";
import { env } from "./config/env";
import healthRoutes from "./routes/health";
import tenantRoutes from "./routes/tenants";
import dashboardRoutes from "./routes/dashboard";
import { tenantContext } from "./middleware/tenant-context";
import { tenantOriginGuard } from "./middleware/tenant-origin";
import authRoutes from "./routes/auth";
import { assertRlsEnabled } from "./db/assert-rls";
import { startCleanupJob } from "./services/refresh-cleanup.service";

const app = new Hono();

// Global error handler for all thrown errors
app.onError((err, c) => {
  if (err instanceof AppError) {
    return errorResponse(c, err.message, err.statusCode, err.code);
  }
  console.error("unhandled error:", err);
  return errorResponse(c, "Internal server error", 500, "INTERNAL_ERROR");
}); //We are using errorHandler Middleware but that doesnt make this onError() redundant, because it can catch errors occuring inside the errorHandler's errorResponse class or any error before the code reaches that middleware.

// 2. Observability
app.use("*", logger());
// app.use('*',logger());
// 3. CORS
const cookieCors = cors({
  origin: ["http://localhost:3001", "http://localhost:3003"], // dashboard dev server
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-User-Token"],
  exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
  credentials: true,
});

const dashboardCors = cors({
  origin: ["http://localhost:3001", "http://localhost:3003"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-User-Token"],
  credentials: true,
});

app.use("*", async (c, next) => {
  if (env.REQ_BODY_TOKENS) {
    if (c.req.method === "OPTIONS" && c.req.path.startsWith("/api/")) {
      const origin = c.req.header("Origin");
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin ?? "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, X-User-Token",
          "Access-Control-Expose-Headers":
            "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (c.req.path.startsWith("/dashboard/") || c.req.path.startsWith("/tenants/")) {
      return dashboardCors(c, next);
    }

    return next();
  }

  return cookieCors(c, next);
});

// 1. Error handler middleware — catches errors from middleware chain
app.use("*", errorHandler);

app.use("*", requestId);

// ─── Layer 3: IP rate-limiting (pre-auth) ─────────────────────────────────────
//
// One registration per route family with NO overlapping patterns.
// For /api/*, we pick AUTH_RATE_LIMIT for auth sub-paths and DEFAULT otherwise
// inside a single middleware so that a request is only charged once.

// Helper: returns the right config for the current request path.
function apiRateLimitConfig(c: Context): RateLimitConfig {
  return c.req.path.startsWith("/api/auth/") ? AUTH_RATE_LIMIT : DEFAULT_RATE_LIMIT;
}

// Single /api/* IP limiter — path-aware, never double-charges
const apiPreAuthRateLimit = async (c: Context, next: Next) => {
  const config = apiRateLimitConfig(c);
  return preAuthRateLimit(config)(c, next);
};

// Single /api/* tenant limiter — same config selection
const apiTenantRateLimit = async (c: Context, next: Next) => {
  const config = apiRateLimitConfig(c);
  return tenantRateLimit(config)(c, next);
};

// Keep this IP limit before tenantContext: authenticating the tenant hits the
// database, so requests with invalid credentials must be throttled before they
// can exhaust database resources. It is intentionally charged separately from
// the post-auth tenant limit; the two buckets are not atomic together.
app.use("/api/*", apiPreAuthRateLimit);
app.use("/tenants/*", preAuthRateLimit(DEFAULT_RATE_LIMIT));
app.use("/dashboard/*", preAuthRateLimit(DEFAULT_RATE_LIMIT));
app.use("/health/*", preAuthRateLimit(MAINT_RATE_LIMIT));

// ─── Tenant authentication ────────────────────────────────────────────────────
// tenantContext verifies the Bearer API key and populates c.get("tenantId").
// It only applies to /api/* — /tenants/* and /dashboard/* use their own auth.
app.use("/api/*", tenantContext);
app.use("/api/*", tenantOriginGuard);

// ─── Layer 2: Tenant rate-limiting (post-auth) ────────────────────────────────
app.use("/api/*", apiTenantRateLimit);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.route("/health", healthRoutes);
app.route("/tenants", tenantRoutes);
app.route("/api/auth", authRoutes);
app.route("/dashboard", dashboardRoutes);

//Test Protected Route. ll be replaced later by real routes in upcoming days
app.get("/ping", (c) => {
  return successResponse(c, {
    message: "Authenticated Successfully",
    tenantId: c.get("tenantId"),
    tenantName: c.get("tenantName"),
  });
});

// Catch-all 404
app.notFound((c) => {
  return errorResponse(c, "Route not found", 404, "NOT_FOUND");
});

if (process.env.NODE_ENV !== "test") {
  void (async () => {
    try {
      await assertRlsEnabled();
      if (env.REQ_BODY_TOKENS) {
        startCleanupJob();
      }
      serve({
        fetch: app.fetch,
        port: env.PORT,
      });
      console.log(`SentinelAuth API running on http://localhost:${env.PORT}`);
    } catch (error) {
      console.error("FATAL: startup security validation failed", error);
      process.exit(1);
    }
  })();
}

export default app;
