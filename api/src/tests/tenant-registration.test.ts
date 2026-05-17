import { describe, it, expect, afterAll, vi } from "vitest";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { tenants, otpTokens } from "../db/schema/index.js";
import { inArray, eq } from "drizzle-orm";
import { generateOtp } from "../utils/crypto.js";

// Mock email sending — we don't want real emails during tests
vi.mock("../services/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

const TEST_EMAILS = [
  "register-test-1@sentineltest.com",
  "register-test-duplicate@sentineltest.com",
  "register-verify@sentineltest.com",
  "register-invalid-otp@sentineltest.com",
];

afterAll(async () => {
  await adminDb.delete(tenants).where(inArray(tenants.adminEmail, [
    ...TEST_EMAILS,
    "register-non-numeric-otp@sentineltest.com",
  ]));
});

describe("POST /tenants/register", () => {
  it("registers a new tenant and returns pending message", async () => {
    const res = await app.fetch(
      new Request("http://localhost/tenants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Corp",
          adminEmail: TEST_EMAILS[0],
          password: "SuperSecure!Password123",
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

  it("rejects duplicate email with 409", async () => {
    const payload = {
      name: "Duplicate Corp",
      adminEmail: TEST_EMAILS[1],
      password: "SuperSecure!Password123",
    };

    await app.fetch(
      new Request("http://localhost/tenants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    const res = await app.fetch(
      new Request("http://localhost/tenants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    expect(res.status).toBe(409);
  });

  it("rejects short password with 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/tenants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Corp",
          adminEmail: "short-pass@test.com",
          password: "short",
        }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("rejects invalid email with 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/tenants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Corp",
          adminEmail: "not-an-email",
          password: "SuperSecure!Password123",
        }),
      })
    );

    expect(res.status).toBe(400);
  });
});

describe("POST /tenants/verify-email", () => {
  it("verifies email and returns API keys", async () => {
    // Register first
    await app.fetch(
      new Request("http://localhost/tenants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Verify Corp",
          adminEmail: TEST_EMAILS[2],
          password: "SuperSecure!Password123",
        }),
      })
    );

    // Get the OTP hash directly from DB (simulating email receipt)
    const [tenant] = await adminDb
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.adminEmail, TEST_EMAILS[2]));

    const [token] = await adminDb
      .select()
      .from(otpTokens)
      .where(eq(otpTokens.tenantId, tenant.id));

    // Generate a matching OTP by finding what hash is stored
    // In tests we bypass email and directly use the stored hash
    // We need to insert a known OTP for testing
    const { rawOtp, otpHash } = generateOtp();
    await adminDb
      .update(otpTokens)
      .set({ tokenHash: otpHash })
      .where(eq(otpTokens.id, token.id));

    const res = await app.fetch(
      new Request("http://localhost/tenants/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: TEST_EMAILS[2],
          otp: rawOtp,
        }),
      })
    );

    const body = (await res.json()) as {
      success: boolean;
      data: {
        tenantId: string;
        publicKey: string;
        secretKey: string;
        message: string;
      };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.tenantId).toBeTruthy();
    expect(body.data.publicKey).toContain("BEGIN PUBLIC KEY");
    expect(body.data.secretKey).toHaveLength(64);
    expect(body.data.message).toContain("not be shown again");
  });

  it("rejects invalid OTP with 401", async () => {
    // Register a tenant first (different from the verified one)
    await app.fetch(
      new Request("http://localhost/tenants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Invalid OTP Test",
          adminEmail: TEST_EMAILS[3],
          password: "SuperSecure!Password123",
        }),
      })
    );

    const res = await app.fetch(
      new Request("http://localhost/tenants/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: TEST_EMAILS[3],
          otp: "000000",
        }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects non-numeric OTP with 400", async () => {
    // Register a tenant first
    await app.fetch(
      new Request("http://localhost/tenants/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Non-numeric OTP Test",
          adminEmail: "register-non-numeric-otp@sentineltest.com",
          password: "SuperSecure!Password123",
        }),
      })
    );

    const res = await app.fetch(
      new Request("http://localhost/tenants/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: "register-non-numeric-otp@sentineltest.com",
          otp: "abcdef",
        }),
      })
    );

    expect(res.status).toBe(400);
  });
});
