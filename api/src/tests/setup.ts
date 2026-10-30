// import "dotenv/config";
import { pool, adminPool } from "../db";
import { redis } from "../lib/redis";

// Default to 1 proxy hop in test runs so that test requests using x-forwarded-for
// resolve to the provided IP address.
process.env.TRUSTED_PROXY_HOPS = "1";

afterAll(async () => {
  await pool.end();
  await adminPool.end();
  redis.disconnect();
});
