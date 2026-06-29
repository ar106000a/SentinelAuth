import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { redis } from "../lib/redis.js";
import {
  isIpBlocked,
  recordFailedAttempt,
  recordSuccessfulLogin,
  getBlockTimeRemaining,
} from "../lib/credential-stuffing.js";

const TEST_IP = "192.0.2.1"; // RFC 5737 test IP

// Clean up Redis keys before and after each test
beforeEach(async () => {
  await redis.del(`stuffing:${TEST_IP}`);
  await redis.del(`block:${TEST_IP}`);
});

afterEach(async () => {
  await redis.del(`stuffing:${TEST_IP}`);
  await redis.del(`block:${TEST_IP}`);
});

describe("Credential stuffing detection", () => {
  it("IP is not blocked initially", async () => {
    const blocked = await isIpBlocked(TEST_IP);
    expect(blocked).toBe(false);
  });

  it("records failed attempts without blocking below threshold", async () => {
    for (let i = 0; i < 5; i++) {
      await recordFailedAttempt(TEST_IP, `user${i}@example.com`);
    }

    const blocked = await isIpBlocked(TEST_IP);
    expect(blocked).toBe(false);
  });

  it("blocks IP after exceeding threshold", async () => {
    // Record 20 failed attempts against different accounts
    for (let i = 0; i < 20; i++) {
      await recordFailedAttempt(TEST_IP, `victim${i}@example.com`);
    }

    const blocked = await isIpBlocked(TEST_IP);
    expect(blocked).toBe(true);
  });

  it("blocked IP has positive time remaining", async () => {
    for (let i = 0; i < 20; i++) {
      await recordFailedAttempt(TEST_IP, `victim${i}@example.com`);
    }

    const remaining = await getBlockTimeRemaining(TEST_IP);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(1800);
  });

  it("clears failed attempts on successful login", async () => {
    for (let i = 0; i < 10; i++) {
      await recordFailedAttempt(TEST_IP, `victim${i}@example.com`);
    }

    await recordSuccessfulLogin(TEST_IP);

    // Record more attempts — counter was reset so shouldn't block yet
    for (let i = 0; i < 10; i++) {
      await recordFailedAttempt(TEST_IP, `victim${i}@example.com`);
    }

    const blocked = await isIpBlocked(TEST_IP);
    expect(blocked).toBe(false);
  });

  it("does not block on repeated attempts against same email", async () => {
    // Same email attempted many times — not credential stuffing
    // Each attempt has a unique timestamp so creates unique members
    // but this is testing business logic, not the counter mechanics
    for (let i = 0; i < 15; i++) {
      await recordFailedAttempt(TEST_IP, "sameuser@example.com");
      // Small delay to ensure unique timestamps
      await new Promise((r) => setTimeout(r, 5));
    }

    // 15 attempts against same account — below threshold of 20
    const blocked = await isIpBlocked(TEST_IP);
    expect(blocked).toBe(false);
  });

  it("unblocks naturally after TTL expires", async () => {
    // Manually set a short-lived block key to simulate expiry
    await redis.set(`block:${TEST_IP}`, "1", "EX", 1);

    const blockedBefore = await isIpBlocked(TEST_IP);
    expect(blockedBefore).toBe(true);

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 1100));

    const blockedAfter = await isIpBlocked(TEST_IP);
    expect(blockedAfter).toBe(false);
  });
});
