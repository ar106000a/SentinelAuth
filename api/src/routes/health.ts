import { Hono } from "hono";
import { pingRedis } from "../lib/redis";
import { adminPool } from "../db";

const health = new Hono();
health.get("/", async (c) => {
  const [redisOk, pgOk] = await Promise.all([
    pingRedis(),
    adminPool
      .query("SELECT 1")
      .then(() => true)
      .catch(() => false),
  ]);
  const allHealthy = redisOk && pgOk;
  return c.json(
    {
      status: allHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        postgres: pgOk ? "healthy" : "unhealthy",
        redis: redisOk ? "healthy" : "unhealthy",
      },
    },
    allHealthy ? 200 : 503
  );
});
export default health;
