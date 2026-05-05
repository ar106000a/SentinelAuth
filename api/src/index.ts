import "./config/env"; // must be first — validates all env vars
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { errorHandler } from "./middleware/error-handler";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { DEFAULT_RATE_LIMIT, AUTH_RATE_LIMIT } from "./lib/rate-limiter";
import { env } from "./config/env";
import healthRoutes from "./routes/health";

const app = new Hono();

// 1. Error handler — must be first so it catches errors from all middleware
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

// 4. Rate limiting
app.use("/api/*", rateLimitMiddleware(DEFAULT_RATE_LIMIT));
app.use("/api/auth/*", rateLimitMiddleware(AUTH_RATE_LIMIT));

// 5. Routes
app.route("/health", healthRoutes);

// Catch-all 404
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: { message: "Route not found", code: "NOT_FOUND" },
    },
    404
  );
});
serve({
  fetch: app.fetch,
  port: env.PORT,
});
console.log(`SentinelAuth API starting on port ${env.PORT}`);

export default app;
