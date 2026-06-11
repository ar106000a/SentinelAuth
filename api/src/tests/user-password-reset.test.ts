import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { tenants, users, otpTokens} from "../db/schema/index.js";
import { eq, and, sql } from "drizzle-orm";
import { cleanupTenants } from "./utils/seed.js";
import {
  generateRSAKeyPair,
  generateSecretKey,
  encryptPrivateKey,
  generateOtp,
} from "../utils/crypto.js";
import type { ApiSuccessResponse } from "@sentinelauth/types";

vi.mock("../services/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_EMAIL = "user-pwd-reset-tenant@sentineltest.com";
const USER_EMAIL = "resetuser@example.com";
const USER_PASSWORD = "SecurePass!123";
const NEW_PASSWORD = "NewSecurePass!456";
let tenantSecret: string;
let tenantId: string;
let userId: string;

async function getActiveResetToken() {
  const [token] = await adminDb
    .select()
    .from(otpTokens)
    .where(
      and(
        eq(otpTokens.userId, userId),
        eq(otpTokens.type, "password_reset"),
        sql`used_at IS NULL`
      )
    )
    .limit(1);
  return token;
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${tenantSecret}`,
  };
}

beforeAll(async () => {
  // Register and setup tenant
  await app.fetch(
    new Request("http://localhost/tenants/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "User PWD Reset Corp",
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

describe("POST /api/auth/forgot-password", () => {
  it("returns 200 for registered email", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL }),
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json() as ApiSuccessResponse<{ message: string }>;
    expect(body.data.message).toContain("reset code has been sent");
  });

  it("returns 200 for unregistered email — no enumeration", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: "ghost@example.com" }),
      })
    );

    expect(res.status).toBe(200);
  });

  it("invalidates previous token when new one is requested", async () => {
    await app.fetch(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL }),
      })
    );

    await app.fetch(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL }),
      })
    );

    const unusedTokens = await adminDb
      .select()
      .from(otpTokens)
      .where(
        and(
          eq(otpTokens.userId, userId),
          eq(otpTokens.type, "password_reset"),
          sql`used_at IS NULL`
        )
      );

    expect(unusedTokens).toHaveLength(1);
  });

  it("requires tenant API key", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: USER_EMAIL }),
      })
    );

    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/reset-password", () => {
  it("resets password with valid OTP", async () => {
    // Request reset
    await app.fetch(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL }),
      })
    );

    // Inject known OTP
    const { rawOtp, otpHash } = generateOtp();
    await adminDb
      .update(otpTokens)
      .set({ tokenHash: otpHash })
      .where(
        and(
          eq(otpTokens.userId, userId),
          eq(otpTokens.type, "password_reset"),
          sql`used_at IS NULL`
        )
      );

    const res = await app.fetch(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: USER_EMAIL,
          otp: rawOtp,
          newPassword: NEW_PASSWORD,
        }),
      })
    );

    expect(res.status).toBe(200);
  });

  it("can log in with new password after reset", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: USER_EMAIL,
          password: NEW_PASSWORD,
        }),
      })
    );

    expect(res.status).toBe(200);
  });

  it("cannot log in with old password after reset", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: USER_EMAIL,
          password: USER_PASSWORD,
        }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("revokes active sessions after reset", async () => {
    // Login to create session
    const loginRes = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: USER_EMAIL,
          password: NEW_PASSWORD,
        }),
      })
    );

    const loginBody = await loginRes.json() as {
      data: { accessToken: string };
    };
    const accessToken = loginBody.data.accessToken;

    // Reset password
    await app.fetch(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL }),
      })
    );

    const { rawOtp, otpHash } = generateOtp();
    await adminDb
      .update(otpTokens)
      .set({ tokenHash: otpHash })
      .where(
        and(
          eq(otpTokens.userId, userId),
          eq(otpTokens.type, "password_reset"),
          sql`used_at IS NULL`
        )
      );

    await app.fetch(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: USER_EMAIL,
          otp: rawOtp,
          newPassword: USER_PASSWORD,
        }),
      })
    );

    // Old access token should be revoked
    const res = await app.fetch(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "X-User-Token": accessToken,
        },
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects invalid OTP with 401", async () => {
    await app.fetch(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL }),
      })
    );

    const res = await app.fetch(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: USER_EMAIL,
          otp: "000000",
          newPassword: NEW_PASSWORD,
        }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects reuse of already used OTP", async () => {
    await app.fetch(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL }),
      })
    );

    const { rawOtp, otpHash } = generateOtp();
    await adminDb
      .update(otpTokens)
      .set({ tokenHash: otpHash })
      .where(
        and(
          eq(otpTokens.userId, userId),
          eq(otpTokens.type, "password_reset"),
          sql`used_at IS NULL`
        )
      );

    // Use once
    await app.fetch(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: USER_EMAIL,
          otp: rawOtp,
          newPassword: USER_PASSWORD,
        }),
      })
    );

    // Try again
    const res = await app.fetch(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: USER_EMAIL,
          otp: rawOtp,
          newPassword: NEW_PASSWORD,
        }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects short new password with 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: USER_EMAIL,
          otp: "123456",
          newPassword: "short",
        }),
      })
    );

    expect(res.status).toBe(400);
  });
});