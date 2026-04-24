import "dotenv/config";
import { Pool } from "pg";
import Redis from "ioredis";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const redis = new Redis(process.env.REDIS_URL as string);

async function main() {
  // Test PostgreSQL
  const pgClient = await pool.connect();
  const result = await pgClient.query("SELECT NOW() as current_time");
  console.log("PostgreSQL connected:", result.rows[0].current_time);
  pgClient.release();

  // Test Redis
  await redis.set("test_key", "sentinelauth_alive");
  const value = await redis.get("test_key");
  console.log("Redis connected, test value:", value);

  await pool.end();
  redis.disconnect();
}

main().catch(console.error);