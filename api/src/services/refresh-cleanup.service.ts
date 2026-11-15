/**
 * refresh-cleanup.service.ts
 *
 * Maintenance job for refresh-token history table (body mode only).
 *
 * Runs on an interval when REQ_BODY_TOKENS=true:
 *   1. Delete history rows for sessions that are revoked or past absolute
 *      expiry by more than 1 day, in batches.
 *   2. Null out successorCiphertext for rows past the grace window.
 */
import { adminPool } from "../db";
import { env } from "../config/env";

const BATCH_SIZE = 500;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export async function runRefreshCleanup(): Promise<{ deleted: number; nulled: number }> {
  if (!env.REQ_BODY_TOKENS) return { deleted: 0, nulled: 0 };

  const client = await adminPool.connect();
  let deleted = 0;

  try {
    // 1. Null out successorCiphertext for rows past the grace window.
    const nullResult = await client.query(
      `UPDATE refresh_token_history
       SET successor_ciphertext = NULL
       WHERE consumed_at IS NOT NULL
         AND consumed_at + ($1 || ' seconds')::interval < NOW()
         AND successor_ciphertext IS NOT NULL`,
      [env.REFRESH_GRACE_SECONDS.toString()]
    );
    const nulled = nullResult.rowCount ?? 0;

    // 2. Delete stale history rows in batches.
    let batchDeleted = BATCH_SIZE;
    while (batchDeleted === BATCH_SIZE) {
      const result = await client.query(
        `DELETE FROM refresh_token_history
         WHERE id IN (
           SELECT rth.id FROM refresh_token_history rth
           JOIN sessions s ON s.id = rth.session_id
           WHERE s.is_revoked = true
              OR s.refresh_absolute_expires_at < NOW() - INTERVAL '1 day'
           LIMIT $1
         )`,
        [BATCH_SIZE]
      );
      batchDeleted = result.rowCount ?? 0;
      deleted += batchDeleted;
    }

    return { deleted, nulled };
  } finally {
    client.release();
  }
}

export function startCleanupJob(): void {
  if (!env.REQ_BODY_TOKENS) return;
  if (cleanupInterval) return; // already running

  // Run once immediately, then on interval.
  void runRefreshCleanup().catch((err) =>
    console.error("[refresh-cleanup] initial run failed:", err)
  );

  cleanupInterval = setInterval(() => {
    void runRefreshCleanup().catch((err) =>
      console.error("[refresh-cleanup] interval run failed:", err)
    );
  }, CLEANUP_INTERVAL_MS);
}

export function stopCleanupJob(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

