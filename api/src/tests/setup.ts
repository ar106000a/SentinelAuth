// import "dotenv/config";
import { pool, adminPool } from "../db";
import { redis } from "../lib/redis";

afterAll(async () => {
  await pool.end();
  await adminPool.end();
  redis.disconnect();
});
