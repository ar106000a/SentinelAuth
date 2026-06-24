import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { users, otpTokens } from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { seedTenant, cleanupTenants } from "./utils/seed.js";
import { generateOtp } from "../utils/crypto.js";
import type {
  LoginSuccessResponse,
  RefreshResponse,
} from "@sentinelauth/types";
import type { ApiSuccessResponse } from "@sentinelauth/types";

vi.mock("../services/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_EMAIL = "jwt-auth-tenant@sentineltest.com";
let tenantSecret: string;
let tenantId: string;
let accessToken: string;
let refreshToken: string;

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

  // Login to get initial tokens
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
  refreshToken = body.data.refreshToken;
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

// 1. Run Refresh tests FIRST while the session is fresh and unrevoked
describe("POST /api/auth/refresh", () => {
  it("issues new access token with valid refresh token", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/refresh", {
        method: "POST",
        headers: tenantHeaders(),
        body: JSON.stringify({ refreshToken }),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<RefreshResponse>;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeTruthy();
    expect(body.data.accessToken.split(".")).toHaveLength(3);

    // New token should be different from the old one
    expect(body.data.accessToken).not.toBe(accessToken);

    // CRITICAL: Update the global accessToken so the logout tests use the new one!
    accessToken = body.data.accessToken;
  });

  it("rejects invalid refresh token", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/refresh", {
        method: "POST",
        headers: tenantHeaders(),
        body: JSON.stringify({ refreshToken: "invalid.token.here" }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects missing refresh token with 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/refresh", {
        method: "POST",
        headers: tenantHeaders(),
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(400);
  });
});

// 2. Run Logout / Middleware tests LAST because they destroy the session
describe("JWT verification middleware & Logout", () => {
  it("rejects request with missing X-User-Token", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: tenantHeaders(),
      })
    );

    expect(res.status).toBe(401);
  });

  it("allows request with valid user token and processes logout", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          ...tenantHeaders(),
          "X-User-Token": accessToken, // Uses the fresh token from the refresh test
        },
      })
    );

    // Logout should succeed
    expect(res.status).toBe(200);
  });

  it("rejects revoked token after logout", async () => {
    // Token was revoked in the test immediately above
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

    // Check your specific error mapping structure, this ensures it failed correctly
    expect(body).toHaveProperty("error");
  });
});
