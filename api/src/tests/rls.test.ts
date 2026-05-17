import { describe, it, expect, afterAll, beforeAll } from "vitest";
import {  db, adminDb } from "../db";
import { tenants, users } from "../db/schema";
import { withTenant } from "../db/with-tenant";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { PoolClient } from "pg";

// Test tenant data
const tenantA = {
  name: "Tenant A",
  adminEmail: "admin-a@rls-test.com",
  passwordHash: "hash_a",
  publicKey: "pubkey_a",
  secretKeyHash: "sechash_a",
};

const tenantB = {
  name: "Tenant B",
  adminEmail: "admin-b@rls-test.com",
  passwordHash: "hash_b",
  publicKey: "pubkey_b",
  secretKeyHash: "sechash_b",
};

let tenantAId: string;
let tenantBId: string;

beforeAll(async () => {
  const [a] = await adminDb.insert(tenants).values(tenantA).returning();
  const [b] = await adminDb.insert(tenants).values(tenantB).returning();
  tenantAId = a.id;
  tenantBId = b.id;

  await adminDb.insert(users).values({
    tenantId: tenantAId,
    email: "user@tenant-a.com",
    passwordHash: "userhash_a",
  });

  await adminDb.insert(users).values({
    tenantId: tenantBId,
    email: "user@tenant-b.com",
    passwordHash: "userhash_b",
  });
});

afterAll(async () => {
  // Cleanup — cascade deletes users too
  await adminDb
    .delete(tenants)
    .where(
      sql`admin_email IN ('admin-a@rls-test.com', 'admin-b@rls-test.com')`
    );
  //   await pool.end(); //setup.ts is ending the pool globally for all test files
});

describe("RLS tenant isolation", () => {
  it("tenant A can only see their own users", async () => {
    const result = await withTenant(tenantAId, async (client: PoolClient) => {
      const tenantDb = drizzle(client, { schema });
      return tenantDb.select().from(users);
    });

    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("user@tenant-a.com");
    expect(result[0].tenantId).toBe(tenantAId);
  });

  it("tenant B can only see their own users", async () => {
    const result = await withTenant(tenantBId, async (client: PoolClient) => {
      const tenantDb = drizzle(client, { schema });
      return tenantDb.select().from(users);
    });

    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("user@tenant-b.com");
    expect(result[0].tenantId).toBe(tenantBId);
  });

  it("tenant A cannot see tenant B users even with explicit query", async () => {
    const result = await withTenant(tenantAId, async (client: PoolClient) => {
      const tenantDb = drizzle(client, { schema });
      // Explicitly try to query tenant B's user by email
      return tenantDb
        .select()
        .from(users)
        .where(eq(users.email, "user@tenant-b.com"));
    });

    // RLS filters this out — returns empty, not tenant B's data
    expect(result).toHaveLength(0);
  });

  it("queries without tenant context fail safely", async () => {
    // Direct query without setting app.current_tenant
    // current_setting throws when variable not set
    await expect(db.select().from(users)).rejects.toThrow();
  });
});
