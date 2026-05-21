import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { users, otpTokens } from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { seedTenant, cleanupTenants } from "./utils/seed.js";
import { generateOtp } from "../utils/crypto.js";

vi.mock("../services/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_EMAIL = "user-reg-tenant@sentineltest.com";
let tenantSecret: string;
let tenantId: string;

beforeAll(async () => {
  const { tenant, rawSecret } = await seedTenant({
    adminEmail: TENANT_EMAIL,
    isVerified: true,
  });
  tenantSecret = rawSecret;
  tenantId = tenant.id;
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

describe("POST /api/auth/register", () => {
  it("registers a new user and returns pending message", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "newuser@example.com",
          password: "SecurePass!123",
        }),
      })
    );

    const body = (await res.json()) as {
      success: boolean;
      data: { message: string };
    };

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.message).toContain("verification code");
  });

  it("rejects duplicate email within same tenant", async () => {
    const payload = {
      email: "duplicate@example.com",
      password: "SecurePass!123",
    };

    await app.fetch(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
    );

    const res = await app.fetch(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
    );

    expect(res.status).toBe(409);
  });

  it("allows same email across different tenants", async () => {
    // Create a second tenant
    const { rawSecret: secret2 } = await seedTenant({
      adminEmail: "user-reg-tenant-2@sentineltest.com",
      isVerified: true,
    });

    const payload = {
      email: "shared@example.com",
      password: "SecurePass!123",
    };

    // Register in first tenant
    await app.fetch(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      })
    );

    // Register same email in second tenant — should succeed
    const res = await app.fetch(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret2}`,
        },
        body: JSON.stringify(payload),
      })
    );

    expect(res.status).toBe(201);

    await cleanupTenants(["user-reg-tenant-2@sentineltest.com"]);
  });

  it("rejects short password with 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "shortpass@example.com",
          password: "short",
        }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("rejects invalid email with 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "not-an-email",
          password: "SecurePass!123",
        }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("rejects request without API key", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "noauth@example.com",
          password: "SecurePass!123",
        }),
      })
    );

    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/verify-email", () => {
  it("verifies user email with correct OTP", async () => {
    // Register user first
    await app.fetch(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "verify-me@example.com",
          password: "SecurePass!123",
        }),
      })
    );

    // Get user and inject known OTP
    const [user] = await adminDb
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          eq(users.email, "verify-me@example.com")
        )
      );

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

    const res = await app.fetch(
      new Request("http://localhost/api/auth/verify-email", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "verify-me@example.com",
          otp: rawOtp,
        }),
      })
    );

    const body = (await res.json()) as {
      success: boolean;
      data: { message: string };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.message).toContain("log in");
  });

  it("rejects invalid OTP with 401", async () => {
    await app.fetch(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "invalid-otp@example.com",
          password: "SecurePass!123",
        }),
      })
    );
    const res = await app.fetch(
      new Request("http://localhost/api/auth/verify-email", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "invalid-otp@example.com",
          otp: "000000",
        }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects already verified user with 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/verify-email", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "verify-me@example.com",
          otp: "123456",
        }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("rejects nonexistent user with 404", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/verify-email", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "ghost@example.com",
          otp: "123456",
        }),
      })
    );

    expect(res.status).toBe(404);
  });

  it("rejects expired OTP with 401", async () => {
    // Register fresh user
    await app.fetch(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "expired-otp-user@example.com",
          password: "SecurePass!1233490000aA@",
        }),
      })
    );

    const [user] = await adminDb
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          eq(users.email, "expired-otp-user@example.com")
        )
      );

    const { rawOtp, otpHash } = generateOtp();

    await adminDb
      .update(otpTokens)
      .set({
        tokenHash: otpHash,
        expiresAt: new Date(Date.now() - 1000),
      })
      .where(eq(otpTokens.userId, user.id));

    const res = await app.fetch(
      new Request("http://localhost/api/auth/verify-email", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: "expired-otp-user@example.com",
          otp: rawOtp,
        }),
      })
    );

    expect(res.status).toBe(401);
  });
});
