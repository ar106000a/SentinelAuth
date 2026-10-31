import { adminDb } from "../db/index";
import { otpTokens } from "../db/schema/index";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import crypto from "crypto";

export const MAX_ATTEMPTS = 5;

/**
 * Atomically increments the attempts counter on adminDb for active tokens where attempts < MAX_ATTEMPTS.
 * Returns the new attempts count, or null if no row was updated (token used, not found, or exhausted).
 */
export async function chargeAttempt(tokenId: string): Promise<number | null> {
  const result = await adminDb
    .update(otpTokens)
    .set({
      attempts: sql`${otpTokens.attempts} + 1`,
    })
    .where(
      and(
        eq(otpTokens.id, tokenId),
        isNull(otpTokens.usedAt),
        lt(otpTokens.attempts, MAX_ATTEMPTS)
      )
    )
    .returning({ attempts: otpTokens.attempts });

  if (result.length === 0) {
    return null;
  }
  return result[0].attempts;
}

/**
 * Revokes a token by setting used_at = now() via adminDb.
 */
export async function revokeToken(tokenId: string): Promise<void> {
  await adminDb
    .update(otpTokens)
    .set({ usedAt: new Date() })
    .where(eq(otpTokens.id, tokenId));
}

/**
 * Atomically consumes a token by setting used_at = now() WHERE used_at IS NULL.
 * Returns the token ID if consumed, or null if already used.
 */
export async function consumeToken(tokenId: string): Promise<string | null> {
  const result = await adminDb
    .update(otpTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(otpTokens.id, tokenId), isNull(otpTokens.usedAt)))
    .returning({ id: otpTokens.id });

  if (result.length === 0) {
    return null;
  }
  return result[0].id;
}

/**
 * Compares two strings using crypto.timingSafeEqual on equal-length buffers.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Revokes other unused tokens for a tenant and optional user of a given type.
 */
export async function revokeUnusedTokens(params: {
  tenantId: string;
  userId?: string | null;
  type: string;
}): Promise<void> {
  const conditions = [
    eq(otpTokens.tenantId, params.tenantId),
    eq(otpTokens.type, params.type),
    isNull(otpTokens.usedAt),
  ];
  if (params.userId !== undefined) {
    if (params.userId === null) {
      conditions.push(isNull(otpTokens.userId));
    } else {
      conditions.push(eq(otpTokens.userId, params.userId));
    }
  }
  await adminDb
    .update(otpTokens)
    .set({ usedAt: new Date() })
    .where(and(...conditions));
}
