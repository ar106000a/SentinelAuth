// import "dotenv/config";
// import { Pool } from "pg";
// import Redis from "ioredis";

// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
// });

// const redis = new Redis(process.env.REDIS_URL as string);

// async function main() {
//   // Test PostgreSQL
//   const pgClient = await pool.connect();
//   const result = await pgClient.query("SELECT NOW() as current_time");
//   console.log("PostgreSQL connected:", result.rows[0].current_time);
//   pgClient.release();

//   // Test Redis
//   await redis.set("test_key", "sentinelauth_alive");
//   const value = await redis.get("test_key");
//   console.log("Redis connected, test value:", value);

//   await pool.end();
//   redis.disconnect();
// }

// main().catch(console.error);

// import "dotenv/config";
// import { db } from "./db";
// import { tenants } from "./db/schema";

// async function main() {
//   const result = await db.select().from(tenants).limit(1);
//   console.log("DB connected. Tables ready:", result);
// }

// main().catch(console.error);

import "./config/env"; // must be first import
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { pingRedis } from "./lib/redis";
import { rateLimitMiddleware } from "./middleware/rate-limit";
import { AUTH_RATE_LIMIT, DEFAULT_RATE_LIMIT } from "./lib/rate-limiter";
import { db, adminDb } from "./db";
import { tenants } from "./db/schema";

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use("*", cors());

// Health check — no rate limiting
app.get("/health", async (c) => {
  const redisOk = await pingRedis();

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      redis: redisOk ? "healthy" : "unhealthy",
    },
  });
});

// General API routes — default rate limit
app.use("/api/*", rateLimitMiddleware(DEFAULT_RATE_LIMIT));

// Auth routes — stricter rate limit
app.use("/api/auth/*", rateLimitMiddleware(AUTH_RATE_LIMIT));

// Stub auth routes (will be implemented in Phase 2)
app.post("/api/auth/register", (c) => {
  return c.json({ message: "Register endpoint — coming in Week 5" }, 200);
});

app.post("/api/auth/login", (c) => {
  return c.json({ message: "Login endpoint — coming in Week 8" }, 200);
});

// Start server
const port = 3000;
console.log(`SentinelAuth API starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
