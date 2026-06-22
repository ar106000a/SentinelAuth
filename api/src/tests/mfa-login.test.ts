import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { generate } from "otplib";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { tenants, users, otpTokens, riskLogs } from "../db/schema/index.js";
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
  LoginResponse,
  MfaSetupResponse,
  MfaVerifyResponse,
} from "@sentinelauth/types";

vi.mock("../services/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_EMAIL = "mfa-login-tenant@sentineltest.com";
const USER_EMAIL = "mfaloginuser@example.com";
const USER_PASSWORD = "SecurePass!123";
let tenantSecret: string;
let tenantId: string;
let totpSecret: string;

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
        name: "MFA Login Corp",
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

  // Login to get access token (no MFA yet)
  const loginRes = await app.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
    })
  );

  const loginBody =
    (await loginRes.json()) as ApiSuccessResponse<LoginResponse>;
  const accessToken = loginBody.data.accessToken!;
  // Sanity check — if this isn't true, nothing below means anything
  expect(loginBody.data.mfaRequired).toBe(false);
  expect(accessToken).toBeTruthy();

  function userHeaders() {
    return { ...authHeaders(), "X-User-Token": accessToken };
  }

  // Setup MFA
  const setupRes = await app.fetch(
    new Request("http://localhost/api/auth/mfa/setup", {
      method: "POST",
      headers: userHeaders(),
    })
  );
  // FAIL LOUD if setup didn't work — this is exactly what went undetected before
  expect(setupRes.status).toBe(200);

  const setupBody =
    (await setupRes.json()) as ApiSuccessResponse<MfaSetupResponse>;
  totpSecret = setupBody.data.secret;
  expect(totpSecret).toBeTruthy();

  // Enable MFA
  const code = await generate({ secret: totpSecret });
  const enableRes = await app.fetch(
    new Request("http://localhost/api/auth/mfa/enable", {
      method: "POST",
      headers: userHeaders(),
      body: JSON.stringify({ code }),
    })
  );
  // FAIL LOUD if enable didn't work
  expect(enableRes.status).toBe(200);

  // Confirm in DB before any test runs
  const [verifyUser] = await adminDb
    .select({ mfaEnabled: users.mfaEnabled })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.email, USER_EMAIL)));
  expect(verifyUser.mfaEnabled).toBe(true);
});

afterAll(async () => {
  await cleanupTenants([TENANT_EMAIL]);
});

describe("POST /api/auth/login with MFA enabled", () => {
  it("returns mfaRequired with sessionChallenge instead of token", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<LoginResponse>;

    expect(res.status).toBe(200);
    expect(body.data.mfaRequired).toBe(true);
    expect(body.data.sessionChallenge).toHaveLength(64);
    expect(body.data.accessToken).toBeUndefined();
    expect(body.data.refreshToken).toBeUndefined();
  });

  it("logs mfa_triggered event", async () => {
    const logs = await adminDb
      .select()
      .from(riskLogs)
      .where(
        and(
          eq(riskLogs.tenantId, tenantId),
          eq(riskLogs.eventType, "mfa_triggered")
        )
      );

    expect(logs.length).toBeGreaterThan(0);
  });
});

describe("POST /api/auth/mfa/verify", () => {
  async function login() {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      })
    );
    const body = (await res.json()) as ApiSuccessResponse<LoginResponse>;
    return body.data.sessionChallenge!;
  }

  it("completes login with valid TOTP code", async () => {
    const sessionChallenge = await login();
    const code = await generate({ secret: totpSecret });

    const res = await app.fetch(
      new Request("http://localhost/api/auth/mfa/verify", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "x-forwarded-for": "203.0.113.42", // add this
        },
        body: JSON.stringify({ sessionChallenge, code }),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<MfaVerifyResponse>;

    expect(res.status).toBe(200);
    expect(body.data.accessToken).toBeTruthy();
    expect(body.data.refreshToken).toBeTruthy();
    expect(body.data.accessToken.split(".")).toHaveLength(3);

    // Add this block — verifies IP was captured on MFA-completed login
    const [user] = await adminDb
      .select({
        lastLoginIp: users.lastLoginIp,
        lastLoginLat: users.lastLoginLat,
        lastLoginLng: users.lastLoginLng,
      })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.email, USER_EMAIL)));

    expect(user.lastLoginIp).toBe("203.0.113.42");
    expect(user.lastLoginLat).toBeNull();
    expect(user.lastLoginLng).toBeNull();
  });

  it("rejects invalid TOTP code", async () => {
    const sessionChallenge = await login();

    const res = await app.fetch(
      new Request("http://localhost/api/auth/mfa/verify", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionChallenge, code: "000000" }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects reuse of session challenge", async () => {
    const sessionChallenge = await login();
    const code = await generate({ secret: totpSecret });

    // First use — succeeds
    await app.fetch(
      new Request("http://localhost/api/auth/mfa/verify", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionChallenge, code }),
      })
    );

    // Second use of the SAME sessionChallenge — should fail regardless of code
    const secondCode = await generate({ secret: totpSecret });
    const res = await app.fetch(
      new Request("http://localhost/api/auth/mfa/verify", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionChallenge, code: secondCode }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects invalid session challenge", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/mfa/verify", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          sessionChallenge: "0".repeat(64),
          code: "123456",
        }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("logs mfa_failed on invalid code", async () => {
    const sessionChallenge = await login();

    await app.fetch(
      new Request("http://localhost/api/auth/mfa/verify", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionChallenge, code: "000000" }),
      })
    );

    const logs = await adminDb
      .select()
      .from(riskLogs)
      .where(
        and(
          eq(riskLogs.tenantId, tenantId),
          eq(riskLogs.eventType, "mfa_failed")
        )
      );

    expect(logs.length).toBeGreaterThan(0);
  });

  it("logs mfa_success on valid completion", async () => {
    const sessionChallenge = await login();
    const code = await generate({ secret: totpSecret });

    await app.fetch(
      new Request("http://localhost/api/auth/mfa/verify", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ sessionChallenge, code }),
      })
    );

    const logs = await adminDb
      .select()
      .from(riskLogs)
      .where(
        and(
          eq(riskLogs.tenantId, tenantId),
          eq(riskLogs.eventType, "mfa_success")
        )
      );

    expect(logs.length).toBeGreaterThan(0);
  });
});
