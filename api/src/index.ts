import "./config/env"; // must be first — validates all env vars
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { errorHandler } from "./middleware/error-handler";
import { errorResponse, successResponse } from "./utils/response";
import { AppError } from "./utils/error";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { DEFAULT_RATE_LIMIT, AUTH_RATE_LIMIT } from "./lib/rate-limiter";
import { env } from "./config/env";
import healthRoutes from "./routes/health";
import tenantRoutes from "./routes/tenants";
import dashboardRoutes from "./routes/dashboard";
import { tenantContext } from "./middleware/tenant-context";
import authRoutes from "./routes/auth";

const app = new Hono();

// Global error handler for all thrown errors
app.onError((err, c) => {
  if (err instanceof AppError) {
    return errorResponse(c, err.message, err.statusCode, err.code);
  }
  console.error("unhandled error:", err);
  return errorResponse(c, "Internal server error", 500, "INTERNAL_ERROR");
});

// 1. Error handler middleware — catches errors from middleware chain
app.use("*", errorHandler);

// 2. Observability
app.use("*", logger());

// 3. CORS
app.use(
  "*",
  cors({
    origin: ["http://localhost:3001"], // dashboard dev server
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["X-RateLimit-Limit", "X-RateLimit-Remaining"],
  })
);
app.use("*", requestId);
// 4. Rate limiting
app.use("/api/*", rateLimitMiddleware(DEFAULT_RATE_LIMIT));
app.use("/api/auth/*", rateLimitMiddleware(AUTH_RATE_LIMIT));

//TenantContext Middleware
app.use("/api/*", tenantContext);

// 5. Routes
app.route("/health", healthRoutes);
app.route("/tenants", tenantRoutes);
app.route("/api/auth", authRoutes);
app.route("/dashboard", dashboardRoutes);

//Test Protected Route. ll be replaced later by real routes in upcoming days
app.get("/api/ping", (c) => {
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
  serve({
    fetch: app.fetch,
    port: env.PORT,
  });
  console.log(`SentinelAuth API running on http://localhost:${env.PORT}`);
}

export default app;
