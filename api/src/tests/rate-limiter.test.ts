import { describe, it, expect, afterEach } from "vitest";
import {
  limit,
  ipLayer,
  tenantLayer,
  DEFAULT_RATE_LIMIT,
  AUTH_RATE_LIMIT,
  RateLimitConfig,
} from "../lib/rate-limiter";
import { redis } from "../lib/redis";
import { randomUUID } from "crypto";

describe("Layered token bucket rate limiter (limit())", () => {
  const createdKeys: string[] = [];

  function makeKey(label: string): string {
    const k = `ratelimit:test:${label}:${randomUUID()}`;
    createdKeys.push(k);
    return k;
  }

  afterEach(async () => {
    if (createdKeys.length > 0) {
      await redis.del(...createdKeys);
      createdKeys.length = 0;
    }
  });

  it("throws if any layer has refill <= 0", async () => {
    const k = makeKey("zero-refill");
    await expect(limit([{ key: k, cap: 5, refill: 0 }])).rejects.toThrow(
      /must be > 0/
    );
    await expect(limit([{ key: k, cap: 5, refill: -1 }])).rejects.toThrow(
      /must be > 0/
    );
  });

  it("returns allowed for brand new buckets with remaining tokens decremented", async () => {
    const k = makeKey("single");
    const result = await limit([{ key: k, cap: 5, refill: 1 }]);

    expect(result.allowed).toBe(true);
    expect(result.failedIndex).toBeNull();
    expect(result.remaining).toBe(4);
    expect(result.resetInSeconds).toBe(0);

    const raw = await redis.hget(k, "tokens");
    expect(Number(raw)).toBe(4);
  });

  it("all-or-nothing: when layer 2 is empty, layer 1's token is untouched", async () => {
    const k1 = makeKey("layer1");
    const k2 = makeKey("layer2");

    const layer1 = { key: k1, cap: 10, refill: 1 };
    const layer2 = { key: k2, cap: 1, refill: 1 };

    // Consume the only token in layer 2
    const prep = await limit([layer2]);
    expect(prep.allowed).toBe(true);

    // Now attempt limit on [layer1, layer2]
    const result = await limit([layer1, layer2]);
    expect(result.allowed).toBe(false);
    expect(result.failedIndex).toBe(1); // layer 2 failed (index 1)

    // Layer 1 was never written in Redis because the multi-layer check failed in Pass 1
    const l1Raw = await redis.hget(k1, "tokens");
    expect(l1Raw).toBeNull();
  });

  it("reports the correct failedIndex for the first denied layer", async () => {
    const k0 = makeKey("layer0");
    const k1 = makeKey("layer1");

    // Exhaust layer 0
    await limit([{ key: k0, cap: 1, refill: 1 }]);

    const res0 = await limit([
      { key: k0, cap: 1, refill: 1 },
      { key: k1, cap: 5, refill: 1 },
    ]);
    expect(res0.allowed).toBe(false);
    expect(res0.failedIndex).toBe(0);

    // If layer 0 has tokens but layer 1 is exhausted
    const kA = makeKey("layerA");
    const kB = makeKey("layerB");
    await limit([{ key: kB, cap: 1, refill: 1 }]); // exhaust kB

    const res1 = await limit([
      { key: kA, cap: 5, refill: 1 },
      { key: kB, cap: 1, refill: 1 },
    ]);
    expect(res1.allowed).toBe(false);
    expect(res1.failedIndex).toBe(1);
    expect(res1.resetInSeconds).toBeGreaterThan(0);
  });

  it("refill math: tokens replenish by elapsed * refillRate up to capacity", async () => {
    const k = makeKey("refill-test");
    const layer = { key: k, cap: 10, refill: 2 }; // 2 tokens per second

    // Exhaust completely (10 tokens)
    for (let i = 0; i < 10; i++) {
      await limit([layer]);
    }

    // Now bucket has 0 tokens
    const emptyCheck = await limit([layer]);
    expect(emptyCheck.allowed).toBe(false);

    // Simulate 2 seconds of elapsed time by rewinding last_refill in Redis
    const now = Date.now() / 1000;
    await redis.hset(k, "last_refill", (now - 2).toString());

    // Should now have 2 seconds * 2 tokens/s = 4 tokens available.
    // Consuming 1 token should succeed and leave 3 remaining.
    const refilled = await limit([layer]);
    expect(refilled.allowed).toBe(true);
    expect(refilled.remaining).toBe(3);
  });

  it("per-key expiry: a 5/hour bucket is not forgotten after 60s (has ~3600s TTL)", async () => {
    const k = makeKey("slow-bucket");
    // 5 per hour: cap = 5, refill = 5 / 3600
    const layer = { key: k, cap: 5, refill: 5 / 3600 };

    await limit([layer]);

    const ttl = await redis.ttl(k);
    // ceil(cap / refill) = 3600 seconds
    expect(ttl).toBeGreaterThan(3500);
    expect(ttl).toBeLessThanOrEqual(3600);
  });

  it("per-key expiry: enforces 60s minimum TTL for fast buckets", async () => {
    const k = makeKey("fast-bucket");
    // 100 tokens with refill 50/s -> cap/refill = 2s, but floor is 60s
    const layer = { key: k, cap: 100, refill: 50 };

    await limit([layer]);

    const ttl = await redis.ttl(k);
    expect(ttl).toBeGreaterThan(50);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it("two limiters with different names never share a key", async () => {
    const ip = "198.51.100.99";
    const layerDefault = ipLayer(DEFAULT_RATE_LIMIT, ip);
    const layerAuth = ipLayer(AUTH_RATE_LIMIT, ip);

    createdKeys.push(layerDefault.key, layerAuth.key);

    expect(layerDefault.key).toContain(":default:");
    expect(layerAuth.key).toContain(":auth:");
    expect(layerDefault.key).not.toBe(layerAuth.key);

    // Custom small config to exhaust
    const smallA: RateLimitConfig = { name: "smallA", maxTokens: 1, refillRate: 1 };
    const smallB: RateLimitConfig = { name: "smallB", maxTokens: 1, refillRate: 1 };

    const layerA = ipLayer(smallA, ip);
    const layerB = ipLayer(smallB, ip);
    createdKeys.push(layerA.key, layerB.key);

    // Exhaust layer A
    const firstA = await limit([layerA]);
    expect(firstA.allowed).toBe(true);
    const secondA = await limit([layerA]);
    expect(secondA.allowed).toBe(false);

    // Layer B should still be untouched and allowed
    const firstB = await limit([layerB]);
    expect(firstB.allowed).toBe(true);
  });
});
