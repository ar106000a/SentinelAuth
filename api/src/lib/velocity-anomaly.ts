import { redis } from "./redis.js";

// Configuration
const VELOCITY_WINDOW_SECONDS = 300; // 5 minute window
const MAX_DISTINCT_IPS = 3; // more than 3 distinct IPs = anomaly
const FLAG_TTL_SECONDS = 86400; // forced MFA flag lasts 24 hours

function velocityKey(tenantId: string, userId: string): string {
  return `velocity:${tenantId}:${userId}`;
}

function mfaForcedKey(tenantId: string, userId: string): string {
  return `mfa_forced:${tenantId}:${userId}`;
}

export async function recordLoginAttempt(
  tenantId: string,
  userId: string,
  ip: string
): Promise<boolean> {
  const key = velocityKey(tenantId, userId);
  const now = Date.now();
  const windowStart = now - VELOCITY_WINDOW_SECONDS * 1000;

  // Sorted set: member = IP address, score = timestamp of latest attempt
  // Using IP as member means each distinct IP appears exactly once —
  // updating the score to latest timestamp keeps the window accurate
  const pipeline = redis.pipeline();
  pipeline.zadd(key, now, ip);
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.expire(key, VELOCITY_WINDOW_SECONDS);
  await pipeline.exec();

  // Count distinct IPs in the current window
  const distinctIps = await redis.zcard(key);

  if (distinctIps > MAX_DISTINCT_IPS) {
    // Set forced MFA flag for this user for 24 hours
    await redis.set(
      mfaForcedKey(tenantId, userId),
      "1",
      "EX",
      FLAG_TTL_SECONDS
    );
    return true; // anomaly detected
  }

  return false; // normal
}

export async function isVelocityAnomalyFlagged(
  tenantId: string,
  userId: string
): Promise<boolean> {
  const flagged = await redis.get(mfaForcedKey(tenantId, userId));
  return flagged !== null;
}

export async function clearVelocityFlag(
  tenantId: string,
  userId: string
): Promise<void> {
  await redis.del(mfaForcedKey(tenantId, userId));
  await redis.del(velocityKey(tenantId, userId));
}

export async function getDistinctIpCount(
  tenantId: string,
  userId: string
): Promise<number> {
  const key = velocityKey(tenantId, userId);
  const windowStart = Date.now() - VELOCITY_WINDOW_SECONDS * 1000;
  await redis.zremrangebyscore(key, 0, windowStart);
  return redis.zcard(key);
}
