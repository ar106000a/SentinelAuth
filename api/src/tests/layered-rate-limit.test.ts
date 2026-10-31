import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { tenants, users, otpTokens } from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { cleanupTenants } from "./utils/seed.js";
import {
  generateRSAKeyPair,
  generateSecretKey,
  encryptPrivateKey,
} from "../utils/crypto.js";
import { redis } from "../lib/redis.js";

vi.mock("../services/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_EMAIL = "rate-limit-tenant@sentineltest.com";
const TARGET_USER_EMAIL = "ratelimituser@example.com";
const USER_PASSWORD = "SecurePassword!123";

let tenantSecret: string;
let tenantId: string;
let userId: string;

function authHeaders(extraHeaders: Record<string, string> = {}) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${tenantSecret}`,
    ...extraHeaders,
  };
}

describe("Layered Rate Limiting Integration Tests", () => {
  const originalEnvHops = process.env.TRUSTED_PROXY_HOPS;

  beforeAll(async () => {
    // Enable rate limiting for these integration tests
    process.env.RATE_LIMIT_DISABLED = "false";
    process.env.TRUSTED_PROXY_HOPS = "1";

    // Register tenant
    await app.fetch(
      new Request("http://localhost/tenants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Rate Limit Tenant Corp",
          adminEmail: TENANT_EMAIL,
          password: "SuperSecure!Password123",
        }),
      })
    );

    const { publicKey, privateKey } = generateRSAKeyPair();
    const { rawSecret, secretKeyHash } = generateSecretKey();
    const privateKeyEncrypted = encryptPrivateKey(privateKey);
    tenantSecret = rawSecret;

    await adminDb
      .update(tenants)
      .set({
        isVerified: true,
        settings: { riskThreshold: 0.7, failOpen: true },
        publicKey,
        secretKeyHash,
        privateKeyEncrypted,
      })
      .where(eq(tenants.adminEmail, TENANT_EMAIL));

    const [tenant] = await adminDb
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.adminEmail, TENANT_EMAIL));
    tenantId = tenant.id;

    // Register and verify target user
    await app.fetch(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: TARGET_USER_EMAIL, password: USER_PASSWORD }),
      })
    );

    const [user] = await adminDb
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, TARGET_USER_EMAIL)));
    userId = user.id;

    await adminDb
      .update(users)
      .set({ isVerified: true })
      .where(eq(users.id, userId));
  });

  beforeEach(async () => {
    // Reset rate limit buckets between individual tests
    const keys = await redis.keys("ratelimit:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    delete process.env.RATE_LIMIT_DISABLED;
    if (originalEnvHops !== undefined) {
      process.env.TRUSTED_PROXY_HOPS = originalEnvHops;
    } else {
      delete process.env.TRUSTED_PROXY_HOPS;
    }

    await cleanupTenants([TENANT_EMAIL]);
    const keys = await redis.keys("ratelimit:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  it("100 forgot-password requests for one email with 100 different forged XFF values: only first creates an OTP", async () => {
    // Test on /tenants/forgot-password (where scope is fixed 'tenant-admin')
    const initialTenantTokens = await adminDb
      .select({ id: otpTokens.id })
      .from(otpTokens)
      .where(
        and(
          eq(otpTokens.tenantId, tenantId),
          eq(otpTokens.type, "password_reset")
        )
      );
    const initialCount = initialTenantTokens.length;

    for (let i = 1; i <= 100; i++) {
      const res = await app.fetch(
        new Request("http://localhost/tenants/forgot-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": `198.51.100.${i}`,
          },
          body: JSON.stringify({ adminEmail: TENANT_EMAIL }),
        })
      );

      // Every request receives the identical 200 response (no user enumeration)
      expect(res.status).toBe(200);
    }

    // In the database: only ONE new OTP was created despite rotating 100 client IPs
    const finalTenantTokens = await adminDb
      .select({ id: otpTokens.id })
      .from(otpTokens)
      .where(
        and(
          eq(otpTokens.tenantId, tenantId),
          eq(otpTokens.type, "password_reset")
        )
      );

    expect(finalTenantTokens.length).toBe(initialCount + 1);
  });

  it("many different emails from one socket IP hit 429 from the IP layer", async () => {
    const sharedIp = "203.0.113.77";

    // AUTH_RATE_LIMIT allows maxTokens = 40.
    // Send 45 requests for 45 distinct emails from the same socket IP.
    let rateLimitedCount = 0;
    let allowedCount = 0;

    const responses = await Promise.all(
      Array.from({ length: 45 }, (_, i) =>
        app.fetch(
          new Request("http://localhost/api/auth/forgot-password", {
            method: "POST",
            headers: authHeaders({
              "x-forwarded-for": sharedIp,
            }),
            body: JSON.stringify({ email: `attacker-victim-${i + 1}@example.com` }),
          })
        )
      )
    );

    for (const res of responses) {
      if (res.status === 200) {
        allowedCount++;
      } else if (res.status === 429) {
        rateLimitedCount++;
        const body = (await res.json()) as { error: string; retryAfter: number };
        expect(body.error).toBe("Too many requests");
        expect(res.headers.get("Retry-After")).toBeDefined();
      }
    }

    // Exactly 40 allowed by IP bucket, 5 denied with 429
    expect(allowedCount).toBe(40);
    expect(rateLimitedCount).toBe(5);
  });

  it("a request with a null IP still hits the tenant and email layers", async () => {
    // HOPS=1 with no x-forwarded-for header -> clientIp is null
    const targetEmail = "null-ip-target@example.com";

    // 1. Verify it hits the tenant layer: response includes tenant rate limit headers
    const res1 = await app.fetch(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: authHeaders(), // no x-forwarded-for -> IP is null
        body: JSON.stringify({ email: targetEmail }),
      })
    );

    expect(res1.status).toBe(200);
    expect(res1.headers.get("X-RateLimit-Limit")).toBeDefined();
    expect(res1.headers.get("X-RateLimit-Remaining")).toBeDefined();

    // 2. Verify it hits Layer 1 (email layer):
    // Check that Redis has the OTP limit bucket keyed with the tenant and email
    const emailKey = `ratelimit:otp-gen-min:password-reset:${tenantId}:${targetEmail}`;
    const tokenVal = await redis.hget(emailKey, "tokens");
    expect(tokenVal).not.toBeNull();
    // Tokens decremented from cap 1 to 0
    expect(Number(tokenVal)).toBe(0);

    // Second request with null IP for same email is throttled at Layer 1
    const res2 = await app.fetch(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: targetEmail }),
      })
    );
    expect(res2.status).toBe(200); // returns 200 generic response

    // 3. Verify it hits the tenant layer when tenant tokens are exhausted
    const tenantKey = `ratelimit:tenant:auth:${tenantId}`;
    await redis.hset(tenantKey, "tokens", "0");

    const resTenantBlocked = await app.fetch(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: authHeaders(), // null IP
        body: JSON.stringify({ email: "another-email@example.com" }),
      })
    );
    expect(resTenantBlocked.status).toBe(429);
    const body = (await resTenantBlocked.json()) as { error: string };
    expect(body.error).toBe("Too many requests");
  });

  it("a throttled and a successful forgot-password return identical responses", async () => {
    const email = "identical-response-test@example.com";

    // Request 1: successful OTP generation (fresh bucket)
    const resSuccess = await app.fetch(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: authHeaders({ "x-forwarded-for": "198.51.100.201" }),
        body: JSON.stringify({ email }),
      })
    );

    // Request 2: throttled OTP generation (bucket exhausted)
    const resThrottled = await app.fetch(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: authHeaders({ "x-forwarded-for": "198.51.100.202" }),
        body: JSON.stringify({ email }),
      })
    );

    expect(resSuccess.status).toBe(200);
    expect(resThrottled.status).toBe(200);

    const bodySuccess = await resSuccess.json();
    const bodyThrottled = await resThrottled.json();

    // Identical status, success flag, and data payload
    expect(bodySuccess.success).toBe(true);
    expect(bodyThrottled.success).toBe(true);
    expect(bodySuccess.data).toEqual(bodyThrottled.data);
    expect(bodySuccess.data).toEqual({
      message: "If this email is registered, a reset code has been sent.",
    });
  });
});
