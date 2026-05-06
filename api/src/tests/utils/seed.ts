import { adminDb } from "../../db/index.js";
import { tenants, users } from "../../db/schema/index.js";
import { createHash, randomBytes } from "crypto";
import { inArray } from "drizzle-orm";


export async function seedTenant(
  overrides: {
    name?: string;
    adminEmail?: string;
  } = {}
) {
  const rawSecret = randomBytes(32).toString("hex");
  const secretKeyHash = createHash("sha256").update(rawSecret).digest("hex");

  const [tenant] = await adminDb
    .insert(tenants)
    .values({
      name: overrides.name ?? "Test Tenant",
      adminEmail: overrides.adminEmail ?? `admin-${Date.now()}@test.com`,
      passwordHash: "test_password_hash",
      publicKey: "test_public_key",
      secretKeyHash,
    })
    .returning();

  return { tenant, rawSecret };
}

export async function seedUser(
  tenantId: string,
  overrides: {
    email?: string;
  } = {}
) {
  const [user] = await adminDb
    .insert(users)
    .values({
      tenantId,
      email: overrides.email ?? `user-${Date.now()}@test.com`,
      passwordHash: "test_password_hash",
    })
    .returning();

  return user;
}

export async function cleanupTenants(emails: string[]) {
  await adminDb.delete(tenants).where(inArray(tenants.adminEmail, emails));
}
