import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withTenant } from "../db/with-tenant.js";
import { adminDb } from "../db/index.js";
import { checkAndRecordDeviceFingerprint } from "../services/device-fingerprint.service.js";
import { deviceFingerprints } from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { seedTenant, seedUser, cleanupTenants } from "./utils/seed.js";
import { PoolClient } from "pg";

const TENANT_EMAIL = "device-fp-test@sentineltest.com";
let tenantId: string;
let userId: string;

beforeAll(async () => {
  const { tenant } = await seedTenant({
    adminEmail: TENANT_EMAIL,
    isVerified: true,
  });
  tenantId = tenant.id;
  const user = await seedUser(tenantId);
  userId = user.id;
});

afterAll(async () => {
  await cleanupTenants([TENANT_EMAIL]);
});

describe("checkAndRecordDeviceFingerprint", () => {
  it("returns true and records fingerprint on first sighting", async () => {
    let isNew!: boolean;

    await withTenant(tenantId, async (client: PoolClient) => {
      isNew = await checkAndRecordDeviceFingerprint(
        client,
        tenantId,
        userId,
        "fingerprint-abc-123"
      );
    });

    expect(isNew).toBe(true);

    const [record] = await adminDb
      .select()
      .from(deviceFingerprints)
      .where(
        and(
          eq(deviceFingerprints.userId, userId),
          eq(deviceFingerprints.fingerprintHash, "fingerprint-abc-123")
        )
      );

    expect(record).toBeTruthy();
  });

  it("returns false on second sighting of the same fingerprint", async () => {
    let isNew!: boolean;

    await withTenant(tenantId, async (client: PoolClient) => {
      isNew = await checkAndRecordDeviceFingerprint(
        client,
        tenantId,
        userId,
        "fingerprint-abc-123"
      );
    });

    expect(isNew).toBe(false);
  });

  it("updates lastSeenAt on repeat sighting", async () => {
    const [before] = await adminDb
      .select({ lastSeenAt: deviceFingerprints.lastSeenAt })
      .from(deviceFingerprints)
      .where(
        and(
          eq(deviceFingerprints.userId, userId),
          eq(deviceFingerprints.fingerprintHash, "fingerprint-abc-123")
        )
      );

    await new Promise((r) => setTimeout(r, 10));

    await withTenant(tenantId, async (client: PoolClient) => {
      await checkAndRecordDeviceFingerprint(
        client,
        tenantId,
        userId,
        "fingerprint-abc-123"
      );
    });

    const [after] = await adminDb
      .select({ lastSeenAt: deviceFingerprints.lastSeenAt })
      .from(deviceFingerprints)
      .where(
        and(
          eq(deviceFingerprints.userId, userId),
          eq(deviceFingerprints.fingerprintHash, "fingerprint-abc-123")
        )
      );

    expect(after.lastSeenAt.getTime()).toBeGreaterThan(
      before.lastSeenAt.getTime()
    );
  });

  it("returns true for a second, different fingerprint from same user", async () => {
    let isNew!: boolean;

    await withTenant(tenantId, async (client: PoolClient) => {
      isNew = await checkAndRecordDeviceFingerprint(
        client,
        tenantId,
        userId,
        "fingerprint-xyz-456"
      );
    });

    expect(isNew).toBe(true);
  });

  it("returns false (fail-open) when fingerprint is null", async () => {
    let isNew!: boolean;

    await withTenant(tenantId, async (client: PoolClient) => {
      isNew = await checkAndRecordDeviceFingerprint(
        client,
        tenantId,
        userId,
        null
      );
    });

    expect(isNew).toBe(false);
  });

  it("does not create a record when fingerprint is null", async () => {
    const records = await adminDb
      .select()
      .from(deviceFingerprints)
      .where(eq(deviceFingerprints.userId, userId));

    // Only the two real fingerprints from earlier tests — no null-fingerprint rows
    expect(records).toHaveLength(2);
  });

  it("same fingerprint hash for different users are independent", async () => {
    const secondUser = await seedUser(tenantId);

    let isNew!: boolean;
    await withTenant(tenantId, async (client: PoolClient) => {
      isNew = await checkAndRecordDeviceFingerprint(
        client,
        tenantId,
        secondUser.id,
        "fingerprint-abc-123" // same hash as userId's first fingerprint
      );
    });

    // New for THIS user even though userId has already seen this exact hash
    expect(isNew).toBe(true);
  });
});
