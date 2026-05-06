import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

// Load from root .env regardless of where the process starts from
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const envSchema = z.object({
  // Database
  DATABASE_URL: z.url("DATABASE_URL must be a valid URL"),
  DATABASE_APP_URL: z.url("DATABASE_APP_URL must be a valid URL"),
  // Redis
  REDIS_URL: z.url("REDIS_URL must be a valid URL"),

  // API
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Security (we'll fill these in Phase 2 — defined now so schema is complete)
  JWT_ACCESS_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("7d"),
  MFA_OTP_EXPIRY_MINUTES: z.coerce.number().default(10),
  ARGON2_MEMORY_COST: z.coerce.number().default(65536),
  ARGON2_TIME_COST: z.coerce.number().default(3),
  HIBP_TIMEOUT_MS: z.coerce.number().default(2000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  parsed.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;
