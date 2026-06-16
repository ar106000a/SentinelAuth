import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { users, otpTokens } from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { seedTenant, cleanupTenants } from "./utils/seed.js";
import { generateOtp } from "../utils/crypto.js";
import type { LoginResponse } from "@sentinelauth/types";
import type { ApiSuccessResponse } from "@sentinelauth/types";

vi.mock("../services/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));


const TENANT_EMAIL = "login-test-tenant@sentineltest.com";
let tenantSecret: string;
let tenantId: string;

// Helper — register and verify a user end to end
async function createVerifiedUser(email: string, password: string) {
  // Register
  await app.fetch(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tenantSecret}`,
      },
      body: JSON.stringify({ email, password }),
    })
  );

  // Inject known OTP and verify
  const [user] = await adminDb
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.email, email)));

  const { rawOtp, otpHash } = generateOtp();

  await adminDb
    .update(otpTokens)
    .set({ tokenHash: otpHash })
    .where(
      and(
        eq(otpTokens.userId, user.id),
        eq(otpTokens.type, "email_verification")
      )
    );

  await app.fetch(
    new Request("http://localhost/api/auth/verify-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tenantSecret}`,
      },
      body: JSON.stringify({ email, otp: rawOtp }),
    })
  );
}

beforeAll(async () => {
  const { tenant, rawSecret } = await seedTenant({
    adminEmail: TENANT_EMAIL,
    isVerified: true,
  });
  tenantSecret = rawSecret;
  tenantId = tenant.id;

  await createVerifiedUser("verified-login@example.com", "SecurePass!123");
});

afterAll(async () => {
  await cleanupTenants([TENANT_EMAIL]);
});

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${tenantSecret}`,
  };
}

describe("POST /api/auth/login", () => {
  it("returns access token for valid credentials", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "verified-login@example.com",
          password: "SecurePass!123",
        }),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<LoginResponse>;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeTruthy();
    expect(body.data.mfaRequired).toBe(false);
    expect(body.data.userId).toBeTruthy();

    // JWT has 3 parts separated by dots
    expect(body.data.accessToken!.split(".")).toHaveLength(3);
  });

  it("rejects wrong password with 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "verified-login@example.com",
          password: "WrongPassword!123",
        }),
      })
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  it("rejects unknown email with same 401 — no enumeration", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "doesnotexist@example.com",
          password: "SecurePass!123",
        }),
      })
    );

    expect(res.status).toBe(401);
    // Same error code as wrong password — attacker cannot distinguish
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  it("rejects unverified user with 403", async () => {
    // Register but don't verify
    await app.fetch(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "unverified-login@example.com",
          password: "SecurePass!123",
        }),
      })
    );

    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "unverified-login@example.com",
          password: "SecurePass!123",
        }),
      })
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("rejects missing password with 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "verified-login@example.com",
        }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("rejects request without API key with 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "verified-login@example.com",
          password: "SecurePass!123",
        }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("JWT contains correct claims", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "verified-login@example.com",
          password: "SecurePass!123",
        }),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<LoginResponse>;
    const token = body.data.accessToken;

    // Decode payload without verifying (base64 decode middle part)
    const payload = JSON.parse(
      Buffer.from(token!.split(".")[1], "base64url").toString("utf8")
    );

    expect(payload.tenantId).toBe(tenantId);
    expect(payload.email).toBe("verified-login@example.com");
    expect(payload.iss).toBe("sentinelauth");
    expect(payload.sub).toBeTruthy();
    expect(payload.exp).toBeGreaterThan(Date.now() / 1000);
  });
});
