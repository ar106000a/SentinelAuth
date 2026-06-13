import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {  generate } from "otplib";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { tenants, users, otpTokens } from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { cleanupTenants } from "./utils/seed.js";
import {
  generateRSAKeyPair,
  generateSecretKey,
  encryptPrivateKey,
  generateOtp,
} from "../utils/crypto.js";
import type {
  ApiSuccessResponse,
  MfaSetupResponse,
  LoginResponse,
} from "@sentinelauth/types";

vi.mock("../services/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_EMAIL = "mfa-setup-tenant@sentineltest.com";
const USER_EMAIL = "mfauser@example.com";
const USER_PASSWORD = "SecurePass!123";
let tenantSecret: string;
let tenantId: string;
let accessToken: string;

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${tenantSecret}`,
  };
}

function userHeaders() {
  return {
    ...authHeaders(),
    "X-User-Token": accessToken,
  };
}

beforeAll(async () => {
  await app.fetch(
    new Request("http://localhost/tenants/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "MFA Setup Corp",
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
      headers: authHeaders(),
      body: JSON.stringify({ email: USER_EMAIL, otp: rawOtp }),
    })
  );

  // Login to get access token
  const loginRes = await app.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
    })
  );

  const loginBody =
    (await loginRes.json()) as ApiSuccessResponse<LoginResponse>;
  accessToken = loginBody.data.accessToken;
});

afterAll(async () => {
  await cleanupTenants([TENANT_EMAIL]);
});

let totpSecret: string;

describe("POST /api/auth/mfa/setup", () => {
  it("returns secret and QR code", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/mfa/setup", {
        method: "POST",
        headers: userHeaders(),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<MfaSetupResponse>;

    expect(res.status).toBe(200);
    expect(body.data.secret).toBeTruthy();
    expect(body.data.qrCodeDataUri).toContain("data:image/png;base64");

    totpSecret = body.data.secret;
  });

  it("requires authentication", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/mfa/setup", {
        method: "POST",
        headers: authHeaders(), // missing X-User-Token
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects setup if already enabled", async () => {
    // Enable first
    const code = await generate({ secret: totpSecret });
    await app.fetch(
      new Request("http://localhost/api/auth/mfa/enable", {
        method: "POST",
        headers: userHeaders(),
        body: JSON.stringify({ code }),
      })
    );

    // Try setup again
    const res = await app.fetch(
      new Request("http://localhost/api/auth/mfa/setup", {
        method: "POST",
        headers: userHeaders(),
      })
    );

    expect(res.status).toBe(400);

    // Cleanup — disable for subsequent tests
    const disableCode = await generate({ secret: totpSecret });
    await app.fetch(
      new Request("http://localhost/api/auth/mfa/disable", {
        method: "POST",
        headers: userHeaders(),
        body: JSON.stringify({ password: USER_PASSWORD, code: disableCode }),
      })
    );
  });
});

describe("POST /api/auth/mfa/enable", () => {
  beforeAll(async () => {
    // Fresh setup for this block
    const res = await app.fetch(
      new Request("http://localhost/api/auth/mfa/setup", {
        method: "POST",
        headers: userHeaders(),
      })
    );
    const body = (await res.json()) as ApiSuccessResponse<MfaSetupResponse>;
    totpSecret = body.data.secret;
  });

  it("rejects invalid code with 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/mfa/enable", {
        method: "POST",
        headers: userHeaders(),
        body: JSON.stringify({ code: "000000" }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects malformed code with 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/mfa/enable", {
        method: "POST",
        headers: userHeaders(),
        body: JSON.stringify({ code: "abc123" }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("enables MFA with valid code", async () => {
    const code = await generate({ secret: totpSecret });

    const res = await app.fetch(
      new Request("http://localhost/api/auth/mfa/enable", {
        method: "POST",
        headers: userHeaders(),
        body: JSON.stringify({ code }),
      })
    );

    expect(res.status).toBe(200);

    // Verify in DB
    const [user] = await adminDb
      .select({ mfaEnabled: users.mfaEnabled })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, USER_EMAIL)));

    expect(user.mfaEnabled).toBe(true);
  });

  it("logs mfa_enabled event", async () => {
    const { riskLogs } = await import("../db/schema/index.js");
    const logs = await adminDb
      .select()
      .from(riskLogs)
      .where(
        and(
          eq(riskLogs.tenantId, tenantId),
          eq(riskLogs.eventType, "mfa_enabled")
        )
      );

    expect(logs.length).toBeGreaterThan(0);
  });
});

describe("POST /api/auth/mfa/disable", () => {
  it("rejects wrong password with 401", async () => {
    const code = await generate({ secret: totpSecret });

    const res = await app.fetch(
      new Request("http://localhost/api/auth/mfa/disable", {
        method: "POST",
        headers: userHeaders(),
        body: JSON.stringify({ password: "WrongPassword!123", code }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects invalid code with 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/mfa/disable", {
        method: "POST",
        headers: userHeaders(),
        body: JSON.stringify({ password: USER_PASSWORD, code: "000000" }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("disables MFA with valid password and code", async () => {
    const code = await generate({ secret: totpSecret });

    const res = await app.fetch(
      new Request("http://localhost/api/auth/mfa/disable", {
        method: "POST",
        headers: userHeaders(),
        body: JSON.stringify({ password: USER_PASSWORD, code }),
      })
    );

    expect(res.status).toBe(200);

    const [user] = await adminDb
      .select({ mfaEnabled: users.mfaEnabled, mfaSecret: users.mfaSecret })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, USER_EMAIL)));

    expect(user.mfaEnabled).toBe(false);
    expect(user.mfaSecret).toBeNull();
  });

  it("rejects disable when MFA not enabled", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/mfa/disable", {
        method: "POST",
        headers: userHeaders(),
        body: JSON.stringify({ password: USER_PASSWORD, code: "123456" }),
      })
    );

    expect(res.status).toBe(400);
  });
});
