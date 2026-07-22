import { drizzle } from "drizzle-orm/node-postgres";
import { PoolClient } from "pg";
import { eq, and } from "drizzle-orm";
import * as schema from "../db/schema/index.js";
import { deviceFingerprints } from "../db/schema/index.js";

/**
 * Checks whether a fingerprint has been seen before for this user,
 * and records it if not (or updates lastSeenAt if it has).
 *
 * Returns true if this is a NEW device (first time seeing this
 * fingerprint for this user), false otherwise.
 *
 * Must be called with an already-open tenantDb client from withTenant —
 * this function does not manage its own transaction, matching the pattern
 * used by every other per-login side effect in auth.service.ts.
 */
export async function checkAndRecordDeviceFingerprint(
  client: PoolClient,
  tenantId: string,
  userId: string,
  fingerprint: string | null
): Promise<boolean> {
  // No fingerprint provided — cannot determine new-ness, treat as unknown
  // (same fail-open philosophy as every other optional signal)
  if (!fingerprint) {
    return false;
  }

  const tenantDb = drizzle(client, { schema });

  const [existing] = await tenantDb
    .select({ id: deviceFingerprints.id })
    .from(deviceFingerprints)
    .where(
      and(
        eq(deviceFingerprints.userId, userId),
        eq(deviceFingerprints.tenantId, tenantId),
        eq(deviceFingerprints.fingerprintHash, fingerprint)
      )
    )
    .limit(1);

  if (existing) {
    // Known device — update lastSeenAt
    await tenantDb
      .update(deviceFingerprints)
      .set({ lastSeenAt: new Date() })
      .where(eq(deviceFingerprints.id, existing.id));

    return false; // not new
  }

  // Unseen fingerprint — record it
  await tenantDb.insert(deviceFingerprints).values({
    tenantId,
    userId,
    fingerprintHash: fingerprint,
  });

  return true; // new device
}
