import dotenv from "dotenv";
import path from "path";
import { z } from "zod";

// Load from root .env regardless of where the process starts from
dotenv.config({ path: path.resolve(__dirname, "../../../.env") }); //loading this once and for all

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
  // Gmail
  // Gmail credentials. Optional in test/CI; provide real values in prod/dev.
  GMAIL_CLIENT_ID: z.string().min(1, "GMAIL_CLIENT_ID is required").optional(),
  GMAIL_CLIENT_SECRET: z
    .string()
    .min(1, "GMAIL_CLIENT_SECRET is required")
    .optional(),
  GMAIL_REFRESH_TOKEN: z
    .string()
    .min(1, "GMAIL_REFRESH_TOKEN is required")
    .optional(),
  GMAIL_SENDER: z.email("GMAIL_SENDER must be a valid email").optional(),
  // Master encryption key used to encrypt tenant private keys. Required in non-test envs.
  MASTER_ENCRYPTION_KEY: z
    .string()
    .min(64, "MASTER_ENCRYPTION_KEY must be 32 bytes hex")
    .optional(),
  JWT_ISSUER: z.string().default("sentinelauth"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(64, "JWT_REFRESH_SECRET must be at least 64 chars"),
});

const parsed = envSchema.safeParse(process.env); //we dont use parse() here because if there is an error, it screams out loud unless we wrap a try catch block around it...safeParse() returns a plain object indicating inside whether the validation succeeded or not

if (!parsed.success) {
  console.error("Invalid environment variables:");
  parsed.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  });
  process.exit(1); //process ll stop with a return message indicating that it failed, resulting in no zombie processes and also telling CI/CD pipelines that build is failed.
}

// Enforce MASTER_ENCRYPTION_KEY presence outside of tests, and provide a test default.
const data = parsed.data as Record<string, unknown>;
if (!data.MASTER_ENCRYPTION_KEY) {
  if (data.NODE_ENV !== "test") {
    console.error("Invalid environment variables:");
    console.error(
      "  MASTER_ENCRYPTION_KEY: MASTER_ENCRYPTION_KEY is required in non-test environments"
    );
    process.exit(1);
  }

  // For tests, provide a deterministic dummy 32-byte hex key (64 hex chars).
  data.MASTER_ENCRYPTION_KEY = "0".repeat(64);
}

export const env = data as {
  DATABASE_URL: string;
  DATABASE_APP_URL: string;
  REDIS_URL: string;
  PORT: number;
  NODE_ENV: "development" | "test" | "production";
  JWT_ACCESS_EXPIRY: string;
  JWT_REFRESH_EXPIRY: string;
  MFA_OTP_EXPIRY_MINUTES: number;
  ARGON2_MEMORY_COST: number;
  ARGON2_TIME_COST: number;
  HIBP_TIMEOUT_MS: number;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  GMAIL_SENDER?: string;
  MASTER_ENCRYPTION_KEY: string;
  JWT_ISSUER: string;
  JWT_REFRESH_SECRET: string;
};
