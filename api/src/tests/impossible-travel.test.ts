import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { tenants, users, riskLogs, otpTokens } from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { cleanupTenants, seedTenant } from "./utils/seed.js";
import {
  generateRSAKeyPair,
  generateSecretKey,
  encryptPrivateKey,
  generateOtp,
} from "../utils/crypto.js";

vi.mock("../services/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_EMAIL = "impossible-travel-tenant@sentineltest.com";
const USER_EMAIL = "traveler@example.com";
const USER_PASSWORD = "SecurePass!123";
let tenantSecret: string;
let tenantId: string;
let userId: string;

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${tenantSecret}`,
  };
}

beforeAll(async () => {
  await app.fetch(
    new Request("http://localhost/tenants/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Impossible Travel Corp",
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

  // Register and verify user
  await app.fetch(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
    })
  );

  const [user] = await adminDb
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.email, USER_EMAIL)));

  userId = user.id;

  const { rawOtp, otpHash } = generateOtp();
  await adminDb
    .update(otpTokens)
    .set({ tokenHash: otpHash })
    .where(
      and(
        eq(otpTokens.userId, userId),
        eq(otpTokens.type, "email_verification")
      )
    );

  await app.fetch(
    new Request("http://localhost/api/auth/verify-email", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email: USER_EMAIL, otp: rawOtp }),
    })
  );
});

afterAll(async () => {
  await cleanupTenants([TENANT_EMAIL]);
});

describe("Impossible travel detection", () => {
  it("no impossible_travel_detected event on first login", async () => {
    // First login — no previous location to compare
    await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "x-forwarded-for": "8.8.8.8", // resolves to US
        },
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      })
    );

    const logs = await adminDb
      .select()
      .from(riskLogs)
      .where(
        and(
          eq(riskLogs.tenantId, tenantId),
          eq(riskLogs.eventType, "impossible_travel_detected")
        )
      );

    expect(logs).toHaveLength(0);
  });

  it("no impossible_travel_detected for nearby location", async () => {
    // Simulate login from nearby IP — same region as 8.8.8.8 (US)
    // Using another US-based Google IP
    await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "x-forwarded-for": "8.8.4.4", // Google DNS secondary — also US
        },
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      })
    );

    const logs = await adminDb
      .select()
      .from(riskLogs)
      .where(
        and(
          eq(riskLogs.tenantId, tenantId),
          eq(riskLogs.eventType, "impossible_travel_detected")
        )
      );

    // Still 0 — same region, no impossible travel
    expect(logs).toHaveLength(0);
  });

  it("detects impossible travel and logs the event", async () => {
    // Force old location to somewhere far away with a recent timestamp
    // Islamabad coordinates — far from US where 8.8.8.8 resolves
    await adminDb
      .update(users)
      .set({
        lastLoginLat: "33.6844",
        lastLoginLng: "73.0479",
        lastLoginAt: new Date(Date.now() - 60 * 1000), // 1 minute ago
      })
      .where(eq(users.id, userId));

    // Now login from US IP — 6000+ km in 1 minute = impossible
    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "x-forwarded-for": "8.8.8.8",
        },
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      })
    );

    expect(res.status).toBe(200);

    const logs = await adminDb
      .select()
      .from(riskLogs)
      .where(
        and(
          eq(riskLogs.tenantId, tenantId),
          eq(riskLogs.eventType, "impossible_travel_detected")
        )
      );

    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].ipAddress).toBe("8.8.8.8");
  });

  it("impossible travel event appears in audit log endpoint", async () => {
    // Login to dashboard
    await adminDb
      .update(tenants)
      .set({
        passwordHash: await import("../utils/crypto.js").then((m) =>
          m.hashPassword("SuperSecure!Password123")
        ),
      })
      .where(eq(tenants.id, tenantId));

    const loginRes = await app.fetch(
      new Request("http://localhost/dashboard/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: TENANT_EMAIL,
          password: "SuperSecure!Password123",
        }),
      })
    );

    const cookie = loginRes.headers.get("set-cookie")!.split(";")[0];

    const res = await app.fetch(
      new Request(
        "http://localhost/dashboard/audit-logs?eventType=impossible_travel_detected",
        { headers: { Cookie: cookie } }
      )
    );

    const body = (await res.json()) as {
      success: boolean;
      data: { entries: Array<{ eventType: string }> };
    };

    expect(res.status).toBe(200);
    expect(body.data.entries.length).toBeGreaterThan(0);
    body.data.entries.forEach((entry) => {
      expect(entry.eventType).toBe("impossible_travel_detected");
    });
  });

  it("features field contains velocity data", async () => {
    const logs = await adminDb
      .select()
      .from(riskLogs)
      .where(
        and(
          eq(riskLogs.tenantId, tenantId),
          eq(riskLogs.eventType, "impossible_travel_detected")
        )
      );

    const features = logs[0].features as Record<string, number | null>;
    expect(features).not.toBeNull();
    expect(features.geo_velocity_kmh).toBeDefined();
    expect(Number(features.geo_velocity_kmh)).toBeGreaterThan(900);
  });
});
