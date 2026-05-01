import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { env } from "../config/env";

// Superuser pool — for migrations and admin ops only, bypasses RLS
export const adminPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// App user pool — RLS enforced, used for all API operations
export const pool = new Pool({
  connectionString: env.DATABASE_APP_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Admin db — only for migrations/schema operations
export const adminDb = drizzle(adminPool, { schema });

// App db — always use this in API code
export const db = drizzle(pool, { schema });
