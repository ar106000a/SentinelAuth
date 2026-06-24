import { describe, it, expect } from "vitest";
import { consumeToken, RateLimitConfig } from "../lib/rate-limiter";
import { redis } from "../lib/redis";
import { randomUUID } from "crypto";

// Own config — never imports AUTH_RATE_LIMIT or DEFAULT_RATE_LIMIT
const UNIT_TEST_CONFIG: RateLimitConfig = {
  maxTokens: 5,
  refillRate: 1,
  windowSeconds: 60,
};

describe("Token bucket rate limiter", () => {
  const testKey = `test-${randomUUID()}`;

  afterEach(async () => {
    // Clean up this test's bucket from Redis after each test
    await redis.del(`ratelimit:${testKey}`);
  });

  it("allows requests within limit", async () => {
    for (let i = 0; i < 5; i++) {
      const result = await consumeToken(testKey, UNIT_TEST_CONFIG);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks when bucket is exhausted", async () => {
    for (let i = 0; i < 5; i++) {
      await consumeToken(testKey, UNIT_TEST_CONFIG);
    }
    const result = await consumeToken(testKey, UNIT_TEST_CONFIG);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("remaining decrements correctly", async () => {
    const first = await consumeToken(testKey, UNIT_TEST_CONFIG);
    expect(first.remaining).toBe(4);

    const second = await consumeToken(testKey, UNIT_TEST_CONFIG);
    expect(second.remaining).toBe(3);
  });

  it("returns resetInSeconds when blocked", async () => {
    for (let i = 0; i < 5; i++) {
      await consumeToken(testKey, UNIT_TEST_CONFIG);
    }
    const result = await consumeToken(testKey, UNIT_TEST_CONFIG);
    expect(result.resetInSeconds).toBeGreaterThan(0);
  });
});
