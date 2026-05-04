import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { consumeToken, AUTH_RATE_LIMIT } from "../lib/rate-limiter";
import { redis } from "../lib/redis";

const TEST_KEY = "test:rate-limit:unit";

beforeEach(async () => {
  // Clean slate for each test
  await redis.del(`ratelimit:${TEST_KEY}`);
});

afterAll(async () => {
  await redis.del(`ratelimit:${TEST_KEY}`);
  redis.disconnect();
});

describe("Token bucket rate limiter", () => {
  it("should allow requests within the limit", async () => {
    const result = await consumeToken(TEST_KEY, {
      maxTokens: 5,
      refillRate: 1,
      windowSeconds: 60,
    });

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("should block requests when bucket is empty", async () => {
    const config = { maxTokens: 3, refillRate: 1, windowSeconds: 60 };

    // Drain the bucket
    await consumeToken(TEST_KEY, config);
    await consumeToken(TEST_KEY, config);
    await consumeToken(TEST_KEY, config);

    // This one should be blocked
    const result = await consumeToken(TEST_KEY, config);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should use stricter limits for auth endpoints", async () => {
    expect(AUTH_RATE_LIMIT.maxTokens).toBeLessThan(100);
    expect(AUTH_RATE_LIMIT.refillRate).toBeLessThanOrEqual(5);
  });

  it("should return resetInSeconds when blocked", async () => {
    const config = { maxTokens: 1, refillRate: 1, windowSeconds: 60 };

    await consumeToken(TEST_KEY, config); // drain
    const blocked = await consumeToken(TEST_KEY, config);

    expect(blocked.allowed).toBe(false);
    expect(blocked.resetInSeconds).toBeGreaterThan(0);
  });
});
