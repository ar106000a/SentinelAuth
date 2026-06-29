import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { redis } from "../lib/redis.js";
import {
  recordLoginAttempt,
  isVelocityAnomalyFlagged,
  clearVelocityFlag,
  getDistinctIpCount,
} from "../lib/velocity-anomaly.js";

const TEST_TENANT = "test-tenant-uuid";
const TEST_USER = "test-user-uuid";

const IPS = ["192.0.2.1", "192.0.2.2", "192.0.2.3", "192.0.2.4"];

async function cleanup() {
  await redis.del(`velocity:${TEST_TENANT}:${TEST_USER}`);
  await redis.del(`mfa_forced:${TEST_TENANT}:${TEST_USER}`);
}

beforeEach(cleanup);
afterEach(cleanup);

describe("Login velocity anomaly detection", () => {
  it("no anomaly with single IP", async () => {
    const anomaly = await recordLoginAttempt(TEST_TENANT, TEST_USER, IPS[0]);
    expect(anomaly).toBe(false);
  });

  it("no anomaly below threshold", async () => {
    let anomaly = false;
    for (const ip of IPS.slice(0, 3)) {
      anomaly = await recordLoginAttempt(TEST_TENANT, TEST_USER, ip);
    }
    expect(anomaly).toBe(false);
  });

  it("detects anomaly when distinct IPs exceed threshold", async () => {
    let anomaly = false;
    for (const ip of IPS) {
      anomaly = await recordLoginAttempt(TEST_TENANT, TEST_USER, ip);
    }
    // 4 distinct IPs > MAX_DISTINCT_IPS (3)
    expect(anomaly).toBe(true);
  });

  it("sets forced MFA flag after anomaly", async () => {
    for (const ip of IPS) {
      await recordLoginAttempt(TEST_TENANT, TEST_USER, ip);
    }

    const flagged = await isVelocityAnomalyFlagged(TEST_TENANT, TEST_USER);
    expect(flagged).toBe(true);
  });

  it("same IP repeated does not increment distinct count", async () => {
    // Same IP 10 times — should not trigger anomaly
    for (let i = 0; i < 10; i++) {
      await recordLoginAttempt(TEST_TENANT, TEST_USER, IPS[0]);
    }

    const count = await getDistinctIpCount(TEST_TENANT, TEST_USER);
    expect(count).toBe(1);

    const flagged = await isVelocityAnomalyFlagged(TEST_TENANT, TEST_USER);
    expect(flagged).toBe(false);
  });

  it("clears flag and counter on clearVelocityFlag", async () => {
    for (const ip of IPS) {
      await recordLoginAttempt(TEST_TENANT, TEST_USER, ip);
    }

    // Anomaly is set
    expect(await isVelocityAnomalyFlagged(TEST_TENANT, TEST_USER)).toBe(true);

    // Clear it
    await clearVelocityFlag(TEST_TENANT, TEST_USER);

    expect(await isVelocityAnomalyFlagged(TEST_TENANT, TEST_USER)).toBe(false);
    expect(await getDistinctIpCount(TEST_TENANT, TEST_USER)).toBe(0);
  });

  it("flag persists across windows once set", async () => {
    // Trigger anomaly
    for (const ip of IPS) {
      await recordLoginAttempt(TEST_TENANT, TEST_USER, ip);
    }

    // Even after clearing the velocity window, the flag remains
    await redis.del(`velocity:${TEST_TENANT}:${TEST_USER}`);

    const flagged = await isVelocityAnomalyFlagged(TEST_TENANT, TEST_USER);
    expect(flagged).toBe(true);
  });

  it("reports not flagged for fresh user", async () => {
    const flagged = await isVelocityAnomalyFlagged(TEST_TENANT, TEST_USER);
    expect(flagged).toBe(false);
  });
});
