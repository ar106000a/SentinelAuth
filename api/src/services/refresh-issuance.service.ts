/**
 * refresh-issuance.service.ts
 *
 * One helper that issues refresh credentials and owns body-mode rotation.
 * Called by both loginUser (auth.service.ts) and verifyMfaChallenge (mfa.service.ts).
 *
 * Cookie mode (REQ_BODY_TOKENS=false):
 *   Returns the refresh JWT directly — the route handler sets the cookie.
 *
 * Body mode (REQ_BODY_TOKENS=true):
 *   Creates the family and first history row, returns refresh JWT in result
 *   so the route can include it in JSON response body (no cookie).
 */
import { PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema/index";
import { eq, and } from "drizzle-orm";
import { env } from "../config/env";
import { hashToken, signRefreshToken } from "../utils/jwt";
import { encryptSuccessor, decryptSuccessor } from "../utils/crypto";
import { AuthenticationError } from "../utils/error";

/** How long to extend idle expiry on each successful rotation. */
function parseTtlMs(ttl: string): number {
  const unit = ttl.slice(-1);
  const value = parseInt(ttl.slice(0, -1), 10);
  switch (unit) {
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

export interface IssueRefreshInput {
  client: PoolClient;
  tenantId: string;
  userId: string;
  sessionId: string;
}

/**
 * Issue the initial refresh credential for a newly created session.
 *
 * Cookie mode: signs and returns a refresh JWT, no DB side effects beyond
 *              whatever the caller already did.
 * Body mode:   additionally creates the first refresh_token_history row and
 *              sets refreshIdleExpiresAt / refreshAbsoluteExpiresAt on the session.
 */
export async function issueInitialRefreshToken(
  input: IssueRefreshInput
): Promise<string> {
  const { client, tenantId, userId, sessionId } = input;

  if (!env.REQ_BODY_TOKENS) {
    return signRefreshToken({ sub: userId, tenantId, sessionId });
  }

  // Body mode — record the family and first history row.
  const tenantDb = drizzle(client, { schema });

  const now = Date.now();
  const idleExpiresAt = new Date(now + parseTtlMs(env.REFRESH_IDLE_TTL));
  const absoluteExpiresAt = new Date(now + parseTtlMs(env.REFRESH_ABSOLUTE_TTL));

  const remainingSeconds = Math.max(1, Math.floor((absoluteExpiresAt.getTime() - now) / 1000));
  const jwtExpirySec = Math.min(
    parseTtlMs(env.JWT_REFRESH_EXPIRY) / 1000,
    remainingSeconds
  );
  const refreshJwt = signRefreshToken(
    { sub: userId, tenantId, sessionId },
    `${jwtExpirySec}s`
  );

  // Set expiry on the session row.
  await tenantDb
    .update(schema.sessions)
    .set({ refreshIdleExpiresAt: idleExpiresAt, refreshAbsoluteExpiresAt: absoluteExpiresAt })
    .where(
      and(
        eq(schema.sessions.id, sessionId),
        eq(schema.sessions.tenantId, tenantId)
      )
    );

  // Insert first history row.
  const tokenHash = hashToken(refreshJwt);
  await tenantDb.insert(schema.refreshTokenHistory).values({
    tenantId,
    sessionId,
    tokenHash,
  });

  return refreshJwt;
}

export interface RotateRefreshInput {
  client: PoolClient;
  tenantId: string;
  refreshToken: string;
}

export interface RotateRefreshOutput {
  accessTokenSub: string;
  sessionId: string;
  newRefreshToken: string;
  /** true when this was a grace-window replay — access token was freshly minted regardless */
  wasGraceReplay: boolean;
}

/**
 * Rotate the refresh token atomically (body mode only).
 *
 * Implements the full state machine described in P0-6:
 *   1. Hash presented token; verify signature.
 *   2. Lock history row + session FOR UPDATE.
 *   3. Reject if session is invalid/revoked/expired.
 *   4a. Unconsumed token → rotate normally.
 *   4b. Consumed inside grace → return stored successor (idempotent replay).
 *   4c. Consumed outside grace → revoke family and reject.
 *   5. Unknown/malformed → reject without revoking anything.
 */
export async function rotateRefreshToken(
  input: RotateRefreshInput
): Promise<RotateRefreshOutput> {
  const { client, tenantId, refreshToken } = input;
  const tenantDb = drizzle(client, { schema });

  // 1. Hash the presented token.
  const presentedHash = hashToken(refreshToken);

  // 2. Find and lock the history row + session.
  //    We use a raw SQL FOR UPDATE to serialise concurrent refreshes.
  const historyRows = await client.query<{
    id: string;
    session_id: string;
    consumed_at: Date | null;
    successor_ciphertext: string | null;
    created_at: Date;
  }>(
    `SELECT rth.id, rth.session_id, rth.consumed_at, rth.successor_ciphertext, rth.created_at
     FROM refresh_token_history rth
     WHERE rth.tenant_id = $1
       AND rth.token_hash = $2
     LIMIT 1
     FOR UPDATE`,
    [tenantId, presentedHash]
  );

  // 5. Unknown token — reject silently, do not revoke anything.
  if (historyRows.rows.length === 0) {
    throw new AuthenticationError("Invalid refresh token");
  }

  const historyRow = historyRows.rows[0];
  const sessionId = historyRow.session_id;

  // Lock the session row too.
  const sessionRows = await client.query<{
    id: string;
    user_id: string;
    is_revoked: boolean;
    refresh_idle_expires_at: Date | null;
    refresh_absolute_expires_at: Date | null;
  }>(
    `SELECT id, user_id, is_revoked, refresh_idle_expires_at, refresh_absolute_expires_at
     FROM sessions
     WHERE id = $1
       AND tenant_id = $2
     LIMIT 1
     FOR UPDATE`,
    [sessionId, tenantId]
  );

  if (sessionRows.rows.length === 0) {
    throw new AuthenticationError("Session not found");
  }

  const session = sessionRows.rows[0];

  // 3a. Revoked session.
  if (session.is_revoked) {
    throw new AuthenticationError("Session has been revoked");
  }

  // 3b. NULL expiries — session was created in cookie mode; not usable in body mode.
  if (!session.refresh_idle_expires_at || !session.refresh_absolute_expires_at) {
    throw new AuthenticationError(
      "TRANSPORT_MISMATCH: This session was created in cookie mode. Please sign in again."
    );
  }

  const now = new Date();

  // 3c. Absolute expiry.
  if (now > new Date(session.refresh_absolute_expires_at)) {
    // Revoke the family and commit immediately so rollback won't undo revocation.
    await client.query(
      `UPDATE sessions SET is_revoked = true WHERE id = $1 AND tenant_id = $2`,
      [sessionId, tenantId]
    );
    await client.query("COMMIT");
    throw new AuthenticationError("Refresh token family has expired");
  }

  // 3d. Idle expiry.
  if (now > new Date(session.refresh_idle_expires_at)) {
    await client.query(
      `UPDATE sessions SET is_revoked = true WHERE id = $1 AND tenant_id = $2`,
      [sessionId, tenantId]
    );
    await client.query("COMMIT");
    throw new AuthenticationError("Refresh token has expired due to inactivity");
  }

  // 4b. Consumed token: check grace window.
  if (historyRow.consumed_at !== null) {
    const consumedAt = new Date(historyRow.consumed_at);
    const graceEndsAt = new Date(
      consumedAt.getTime() + env.REFRESH_GRACE_SECONDS * 1000
    );

    if (now <= graceEndsAt) {
      // Grace replay — return stored successor without rotating.
      if (!historyRow.successor_ciphertext) {
        // Should never happen in production; successor was already nulled = grace expired server-side.
        throw new AuthenticationError("Grace window has passed");
      }
      const successorToken = decryptSuccessor(historyRow.successor_ciphertext);
      return {
        accessTokenSub: session.user_id,
        sessionId,
        newRefreshToken: successorToken,
        wasGraceReplay: true,
      };
    }

    // 4c. Consumed OUTSIDE grace — revoke the whole family.
    await client.query(
      `UPDATE sessions SET is_revoked = true WHERE id = $1 AND tenant_id = $2`,
      [sessionId, tenantId]
    );
    await client.query("COMMIT");
    throw new AuthenticationError(
      "Refresh token replay detected outside grace window. Family revoked."
    );
  }

  // Lazily clean up expired successors on read for this session.
  await nullExpiredSuccessors(client, sessionId, env.REFRESH_GRACE_SECONDS).catch(() => {});

  // 4a. Unconsumed token — rotate.
  const userId = session.user_id;
  const remainingSeconds = Math.max(
    1,
    Math.floor((new Date(session.refresh_absolute_expires_at).getTime() - now.getTime()) / 1000)
  );
  const jwtExpirySec = Math.min(
    parseTtlMs(env.JWT_REFRESH_EXPIRY) / 1000,
    remainingSeconds
  );
  const newRefreshJwt = signRefreshToken(
    { sub: userId, tenantId, sessionId },
    `${jwtExpirySec}s`
  );
  const newHash = hashToken(newRefreshJwt);

  // Encrypt successor for grace-window recovery.
  const successorCiphertext = encryptSuccessor(newRefreshJwt);

  const newIdleExpiresAt = new Date(
    Math.min(
      now.getTime() + parseTtlMs(env.REFRESH_IDLE_TTL),
      new Date(session.refresh_absolute_expires_at).getTime()
    )
  );

  // Mark current token consumed + store successor ciphertext.
  await client.query(
    `UPDATE refresh_token_history
     SET consumed_at = $1, successor_ciphertext = $2
     WHERE id = $3`,
    [now, successorCiphertext, historyRow.id]
  );

  // Insert new history row.
  await tenantDb.insert(schema.refreshTokenHistory).values({
    tenantId,
    sessionId,
    tokenHash: newHash,
  });

  // Advance idle expiry (never the absolute expiry).
  await client.query(
    `UPDATE sessions SET refresh_idle_expires_at = $1 WHERE id = $2 AND tenant_id = $3`,
    [newIdleExpiresAt, sessionId, tenantId]
  );

  return {
    accessTokenSub: userId,
    sessionId,
    newRefreshToken: newRefreshJwt,
    wasGraceReplay: false,
  };
}

/**
 * Lazily null out successorCiphertext for history rows whose grace window has
 * passed. Called on read during rotation (cleanup path).
 * This is best-effort; the actual cleanup job handles bulk nulling.
 */
export async function nullExpiredSuccessors(
  client: PoolClient,
  sessionId: string,
  graceSeconds: number
): Promise<void> {
  await client.query(
    `UPDATE refresh_token_history
     SET successor_ciphertext = NULL
     WHERE session_id = $1
       AND consumed_at IS NOT NULL
       AND consumed_at + ($2 || ' seconds')::interval < NOW()
       AND successor_ciphertext IS NOT NULL`,
    [sessionId, graceSeconds.toString()]
  );
}

