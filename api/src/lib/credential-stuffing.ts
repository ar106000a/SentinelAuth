import { redis } from "./redis.js";

// Configuration
const WINDOW_SECONDS = 600; // 10 minute sliding window
const MAX_ATTEMPTS = 20; // max failed attempts per IP per window
const BLOCK_DURATION_SECONDS = 1800; // 30 minute block

function stuffingKey(ip: string): string {
  return `stuffing:${ip}`;
}

function blockKey(ip: string): string {
  return `block:${ip}`;
}

export async function isIpBlocked(ip: string): Promise<boolean> {
  const blocked = await redis.get(blockKey(ip));
  return blocked !== null;
}

export async function recordFailedAttempt(
  ip: string,
  email: string
): Promise<void> {
  const key = stuffingKey(ip);
  const now = Date.now();
  const windowStart = now - WINDOW_SECONDS * 1000;

  // Sorted set: member = `${timestamp}:${email}`, score = timestamp
  // This lets us count DISTINCT emails targeted from this IP
  // within the window — the core signal for credential stuffing
  const member = `${now}:${email}`;

  const pipeline = redis.pipeline();

  // Add this attempt
  pipeline.zadd(key, now, member);

  // Remove attempts outside the window
  pipeline.zremrangebyscore(key, 0, windowStart);

  // Set TTL so idle keys clean themselves up
  pipeline.expire(key, WINDOW_SECONDS);

  await pipeline.exec();

  // Count distinct emails in window
  const attempts = await redis.zcard(key);

  if (attempts >= MAX_ATTEMPTS) {
    // Block this IP
    await redis.set(blockKey(ip), "1", "EX", BLOCK_DURATION_SECONDS);

    // Clean up the counter — no point keeping it while blocked
    await redis.del(key);
  }
}

export async function recordSuccessfulLogin(ip: string): Promise<void> {
  // Successful login clears the failed attempt counter for this IP
  // Prevents legitimate users from being blocked due to earlier typos
  await redis.del(stuffingKey(ip));
}

export async function getBlockTimeRemaining(ip: string): Promise<number> {
  const ttl = await redis.ttl(blockKey(ip));
  return Math.max(0, ttl);
}
