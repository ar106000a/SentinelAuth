import { describe, it, expect } from "vitest";
import { db } from "../db";
import {
  tenants,
  users,
  sessions,
  otpTokens,
  riskLogs,
  tenantSessions,
} from "../db/schema";
import { sql } from "drizzle-orm";

describe("Database schema smoke tests", () => {
  it("should connect to the database", async () => {
    const result = await db.execute(sql`SELECT 1 as connected`);
    expect(result.rows[0]).toEqual({ connected: 1 });
  });

  it("should have all 6 tables accessible via Drizzle", async () => {
    const results = await Promise.all([
      db.select().from(tenants).limit(0),
      db.select().from(tenantSessions).limit(0),
      db.select().from(users).limit(0),
      db.select().from(sessions).limit(0),
      db.select().from(otpTokens).limit(0),
      db.select().from(riskLogs).limit(0),
    ]);

    results.forEach((result) => {
      expect(Array.isArray(result)).toBe(true);
    });
  });

  it("should enforce unique email constraint on tenants", async () => {
    const duplicateInsert = async () => {
      await db.insert(tenants).values({
        name: "Test Tenant A",
        adminEmail: "duplicate@test.com",
        passwordHash: "hash1",
        publicKey: "pubkey1",
        secretKeyHash: "sechash1",
      });
      await db.insert(tenants).values({
        name: "Test Tenant B",
        adminEmail: "duplicate@test.com",
        passwordHash: "hash2",
        publicKey: "pubkey2",
        secretKeyHash: "sechash2",
      });
    };

    await expect(duplicateInsert()).rejects.toThrow();

    // Cleanup
    await db.delete(tenants).where(sql`admin_email = 'duplicate@test.com'`);
  });
});
