import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { users, otpTokens } from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { seedTenant, cleanupTenants } from "./utils/seed.js";
import { generateOtp } from "../utils/crypto.js";
import type {
  LoginSuccessResponse,
  ApiSuccessResponse,
} from "@sentinelauth/types";

vi.mock("../services/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_EMAIL = "jwt-auth-tenant@sentineltest.com";
let tenantSecret: string;
let tenantId: string;
let accessToken: string;

async function createVerifiedUser(email: string, password: string) {
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

  await createVerifiedUser("jwt-user@example.com", "SecurePass!123");

  const res = await app.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tenantSecret}`,
      },
      body: JSON.stringify({
        email: "jwt-user@example.com",
        password: "SecurePass!123",
      }),
    })
  );

  const body = (await res.json()) as ApiSuccessResponse<LoginSuccessResponse>;
  accessToken = body.data.accessToken;
});

afterAll(async () => {
  await cleanupTenants([TENANT_EMAIL]);
});

function tenantHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${tenantSecret}`,
  };
}

// Refresh-flow coverage (cookie issuance, cookie-only contract, re-issuance
// on refresh, rejection with no/malformed/body-supplied token) now lives
// entirely in auth-cookie.test.ts as of SENT-1146. This file retains only
// what's specific to it: the userAuth middleware's own token-presence and
// revocation checks.

describe("userAuth middleware", () => {
  it("rejects request with missing X-User-Token", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: tenantHeaders(),
      })
    );

    expect(res.status).toBe(401);
  });

  it("allows request with a valid, unrevoked user token", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          ...tenantHeaders(),
          "X-User-Token": accessToken,
        },
      })
    );

    expect(res.status).toBe(200);
  });

  it("rejects the same token again after logout has revoked it", async () => {
    // Token was revoked by the logout call in the test immediately above.
    const res = await app.fetch(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          ...tenantHeaders(),
          "X-User-Token": accessToken,
        },
      })
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body).toHaveProperty("error");
  });
});
