import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { tenants, otpTokens } from "../db/schema/index.js";
import { eq, and, sql } from "drizzle-orm";
import { cleanupTenants } from "./utils/seed.js";
import { generateOtp } from "../utils/crypto.js";
import type {
  ApiSuccessResponse,
  ForgotPasswordResponse,
} from "@sentinelauth/types";

vi.mock("../services/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_EMAIL = "pwd-reset-test@sentineltest.com";
const TENANT_PASSWORD = "SuperSecure!Password123";
const NEW_PASSWORD = "NewSuperSecure!Password456";
let tenantId: string;

beforeAll(async () => {
  await app.fetch(
    new Request("http://localhost/tenants/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Password Reset Corp",
        adminEmail: TENANT_EMAIL,
        password: TENANT_PASSWORD,
      }),
    })
  );

  await adminDb
    .update(tenants)
    .set({
      isVerified: true,
      settings: { riskThreshold: 0.7, failOpen: true },
    })
    .where(eq(tenants.adminEmail, TENANT_EMAIL));

  const [tenant] = await adminDb
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.adminEmail, TENANT_EMAIL));

  tenantId = tenant.id;
});

afterAll(async () => {
  await cleanupTenants([TENANT_EMAIL]);
});

describe("POST /tenants/forgot-password", () => {
  it("returns 200 for registered email", async () => {
    const res = await app.fetch(
      new Request("http://localhost/tenants/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminEmail: TENANT_EMAIL }),
      })
    );

    const body =
      (await res.json()) as ApiSuccessResponse<ForgotPasswordResponse>;

    expect(res.status).toBe(200);
    expect(body.data.message).toContain("reset code has been sent");
  });

  it("returns 200 for unregistered email — no enumeration", async () => {
    const res = await app.fetch(
      new Request("http://localhost/tenants/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminEmail: "ghost@sentineltest.com" }),
      })
    );

    // Same response as registered email
    expect(res.status).toBe(200);
    const body =
      (await res.json()) as ApiSuccessResponse<ForgotPasswordResponse>;
    expect(body.data.message).toContain("reset code has been sent");
  });

  it("rejects invalid email with 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/tenants/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminEmail: "not-an-email" }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("invalidates previous reset token when new one is requested", async () => {
    // Request twice
    await app.fetch(
      new Request("http://localhost/tenants/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminEmail: TENANT_EMAIL }),
      })
    );

    await app.fetch(
      new Request("http://localhost/tenants/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminEmail: TENANT_EMAIL }),
      })
    );

    // Only one unused token should exist
    const unusedTokens = await adminDb
      .select()
      .from(otpTokens)
      .where(
        and(
          eq(otpTokens.tenantId, tenantId),
          eq(otpTokens.type, "password_reset"),
          sql`used_at IS NULL`
        )
      );

    expect(unusedTokens).toHaveLength(1);
  });
});

describe("POST /tenants/reset-password", () => {
  it("resets password with valid OTP", async () => {
    // Request a reset
    await app.fetch(
      new Request("http://localhost/tenants/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminEmail: TENANT_EMAIL }),
      })
    );

    // Inject known OTP
    const { rawOtp, otpHash } = generateOtp();
    await adminDb
      .update(otpTokens)
      .set({ tokenHash: otpHash })
      .where(
        and(
          eq(otpTokens.tenantId, tenantId),
          eq(otpTokens.type, "password_reset"),
          sql`used_at IS NULL`
        )
      );

    const res = await app.fetch(
      new Request("http://localhost/tenants/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: TENANT_EMAIL,
          otp: rawOtp,
          newPassword: NEW_PASSWORD,
        }),
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<{ message: string }>;
    expect(body.data.message).toContain("Password reset successfully");
  });

  it("can log in with new password after reset", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: TENANT_EMAIL,
          password: NEW_PASSWORD,
        }),
      })
    );

    expect(res.status).toBe(200);
  });

  it("cannot log in with old password after reset", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: TENANT_EMAIL,
          password: TENANT_PASSWORD,
        }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects invalid OTP with 401", async () => {
    // Request a fresh reset
    await app.fetch(
      new Request("http://localhost/tenants/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminEmail: TENANT_EMAIL }),
      })
    );

    const res = await app.fetch(
      new Request("http://localhost/tenants/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: TENANT_EMAIL,
          otp: "000000",
          newPassword: NEW_PASSWORD,
        }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects reuse of already used OTP", async () => {
    // Inject and use a known OTP
    const { rawOtp, otpHash } = generateOtp();
    await adminDb
      .update(otpTokens)
      .set({ tokenHash: otpHash })
      .where(
        and(
          eq(otpTokens.tenantId, tenantId),
          eq(otpTokens.type, "password_reset"),
          sql`used_at IS NULL`
        )
      );

    // Use it once
    await app.fetch(
      new Request("http://localhost/tenants/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: TENANT_EMAIL,
          otp: rawOtp,
          newPassword: NEW_PASSWORD,
        }),
      })
    );

    // Try to use it again
    const res = await app.fetch(
      new Request("http://localhost/tenants/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: TENANT_EMAIL,
          otp: rawOtp,
          newPassword: "AnotherPassword!123",
        }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects short new password with 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/tenants/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: TENANT_EMAIL,
          otp: "123456",
          newPassword: "short",
        }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("clears dashboard sessions after password reset", async () => {
    // Login to create a session
    const loginRes = await app.fetch(
      new Request("http://localhost/dashboard/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: TENANT_EMAIL,
          password: NEW_PASSWORD,
        }),
      })
    );

    const cookie = loginRes.headers.get("set-cookie")!.split(";")[0];

    // Request reset and apply it
    await app.fetch(
      new Request("http://localhost/tenants/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminEmail: TENANT_EMAIL }),
      })
    );

    const { rawOtp, otpHash } = generateOtp();
    await adminDb
      .update(otpTokens)
      .set({ tokenHash: otpHash })
      .where(
        and(
          eq(otpTokens.tenantId, tenantId),
          eq(otpTokens.type, "password_reset"),
          sql`used_at IS NULL`
        )
      );

    await app.fetch(
      new Request("http://localhost/tenants/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: TENANT_EMAIL,
          otp: rawOtp,
          newPassword: TENANT_PASSWORD,
        }),
      })
    );

    // Old session cookie should be invalid
    const res = await app.fetch(
      new Request("http://localhost/dashboard/me", {
        headers: { Cookie: cookie },
      })
    );

    expect(res.status).toBe(401);
  });
});
