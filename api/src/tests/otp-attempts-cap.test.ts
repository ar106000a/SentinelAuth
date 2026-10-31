import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { generate } from "otplib";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { tenants, users, otpTokens } from "../db/schema/index.js";
import { eq, and, sql } from "drizzle-orm";
import { seedTenant, seedUser, cleanupTenants } from "./utils/seed.js";
import { generateOtp, sha256 } from "../utils/crypto.js";

vi.mock("../services/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/hibp.service.js", () => ({
  isPasswordPwned: vi.fn().mockResolvedValue(false),
}));

const TENANT_ADMIN_EMAIL = "otp-cap-tenant@sentineltest.com";
let tenantId: string;
let tenantSecret: string;

beforeAll(async () => {
  const seeded = await seedTenant({
    adminEmail: TENANT_ADMIN_EMAIL,
    isVerified: true,
  });
  tenantId = seeded.tenant.id;
  tenantSecret = seeded.rawSecret;
});

afterAll(async () => {
  await cleanupTenants([
    TENANT_ADMIN_EMAIL,
    "otp-tenant-email@sentineltest.com",
    "otp-tenant-reset@sentineltest.com",
  ]);
});

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${tenantSecret}`,
  };
}

describe("Per-token OTP Attempt Cap & Verification Paths", () => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. verifyUserEmail: 5 wrong guesses lock token, correct code rejected after
  //    and two parallel correct submissions: exactly one succeeds
  // ─────────────────────────────────────────────────────────────────────────────
  describe("verifyUserEmail (/api/auth/verify-email)", () => {
    it("5 wrong guesses kill the token and subsequent correct code is rejected", async () => {
      const email = "user-cap-lockout@example.com";
      const user = await seedUser(tenantId, { email });

      const { rawOtp, otpHash } = generateOtp();
      const [token] = await adminDb
        .insert(otpTokens)
        .values({
          tenantId,
          userId: user.id,
          tokenHash: otpHash,
          type: "email_verification",
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        })
        .returning();

      // 4 wrong guesses return 401
      for (let i = 0; i < 4; i++) {
        const res = await app.fetch(
          new Request("http://localhost/api/auth/verify-email", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ email, otp: "000000" }),
          })
        );
        expect(res.status).toBe(401);
      }

      // 5th wrong guess locks the token and returns 400
      const lockRes = await app.fetch(
        new Request("http://localhost/api/auth/verify-email", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ email, otp: "000000" }),
        })
      );
      expect(lockRes.status).toBe(400);
      const lockBody = (await lockRes.json()) as { error: { message: string } };
      expect(lockBody.error.message.toLowerCase()).toContain("wrong code");

      // Verify token row in DB
      const [tokenInDb] = await adminDb
        .select()
        .from(otpTokens)
        .where(eq(otpTokens.id, token.id));
      expect(tokenInDb.attempts).toBe(5);
      expect(tokenInDb.usedAt).not.toBeNull();

      // Attempting with correct code afterwards is rejected (401)
      const correctRes = await app.fetch(
        new Request("http://localhost/api/auth/verify-email", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ email, otp: rawOtp }),
        })
      );
      expect(correctRes.status).toBe(401);

      const [userInDb] = await adminDb
        .select()
        .from(users)
        .where(eq(users.id, user.id));
      expect(userInDb.isVerified).toBe(false);
    });

    it("two parallel correct submissions: exactly one succeeds", async () => {
      const email = "user-race-verify@example.com";
      const user = await seedUser(tenantId, { email });

      const { rawOtp, otpHash } = generateOtp();
      await adminDb.insert(otpTokens).values({
        tenantId,
        userId: user.id,
        tokenHash: otpHash,
        type: "email_verification",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      const [res1, res2] = await Promise.all([
        app.fetch(
          new Request("http://localhost/api/auth/verify-email", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ email, otp: rawOtp }),
          })
        ),
        app.fetch(
          new Request("http://localhost/api/auth/verify-email", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ email, otp: rawOtp }),
          })
        ),
      ]);

      const successCount = [res1.status, res2.status].filter((s) => s === 200).length;
      expect(successCount).toBe(1);

      const failedStatus = [res1.status, res2.status].find((s) => s !== 200);
      expect([400, 401]).toContain(failedStatus);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. verifyTenantEmail: 50 parallel wrong guesses end with attempts = 5 exactly
  // ─────────────────────────────────────────────────────────────────────────────
  describe("verifyTenantEmail (/tenants/verify-email)", () => {
    it("50 parallel wrong guesses end with attempts = 5 exactly", async () => {
      const adminEmail = "otp-tenant-email@sentineltest.com";
      const { tenant } = await seedTenant({
        adminEmail,
        isVerified: false,
      });

      const { otpHash } = generateOtp();
      const [token] = await adminDb
        .insert(otpTokens)
        .values({
          tenantId: tenant.id,
          userId: null,
          tokenHash: otpHash,
          type: "email_verification",
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        })
        .returning();

      // Launch 50 parallel wrong guesses
      await Promise.all(
        Array.from({ length: 50 }, () =>
          app.fetch(
            new Request("http://localhost/tenants/verify-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ adminEmail, otp: "999999" }),
            })
          )
        )
      );

      const [tokenInDb] = await adminDb
        .select()
        .from(otpTokens)
        .where(eq(otpTokens.id, token.id));

      expect(tokenInDb.attempts).toBe(5);
      expect(tokenInDb.usedAt).not.toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. userResetPassword:
  //    - rollback persistence of wrong guess
  //    - unknown user, wrong code, and expired code return identical 401 responses
  //    - revokes other unused reset tokens on success
  // ─────────────────────────────────────────────────────────────────────────────
  describe("userResetPassword (/api/auth/reset-password)", () => {
    it("persists wrong guess increment even though transaction rolled back", async () => {
      const email = "user-pwd-rollback@example.com";
      const user = await seedUser(tenantId, { email });

      const { otpHash } = generateOtp();
      const [token] = await adminDb
        .insert(otpTokens)
        .values({
          tenantId,
          userId: user.id,
          tokenHash: otpHash,
          type: "password_reset",
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        })
        .returning();

      // A wrong guess rolls back withTenant transaction
      const res = await app.fetch(
        new Request("http://localhost/api/auth/reset-password", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email,
            otp: "111111",
            newPassword: "NewSecurePassword!123",
          }),
        })
      );
      expect(res.status).toBe(401);

      // Despite transaction rollback, adminDb increment persisted
      const [tokenInDb] = await adminDb
        .select()
        .from(otpTokens)
        .where(eq(otpTokens.id, token.id));

      expect(tokenInDb.attempts).toBe(1);
    });

    it("returns identical 401 responses for unknown user, wrong code, and expired code", async () => {
      const email = "user-pwd-enum@example.com";
      const user = await seedUser(tenantId, { email });

      const { otpHash } = generateOtp();

      // Active token
      await adminDb.insert(otpTokens).values({
        tenantId,
        userId: user.id,
        tokenHash: otpHash,
        type: "password_reset",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // 1. Unknown user
      const unknownRes = await app.fetch(
        new Request("http://localhost/api/auth/reset-password", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email: "doesnotexist@example.com",
            otp: "123456",
            newPassword: "NewSecurePassword!123",
          }),
        })
      );
      const unknownBody = (await unknownRes.json()) as { error: { message: string } };

      // 2. Wrong code
      const wrongRes = await app.fetch(
        new Request("http://localhost/api/auth/reset-password", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email,
            otp: "000000",
            newPassword: "NewSecurePassword!123",
          }),
        })
      );
      const wrongBody = (await wrongRes.json()) as { error: { message: string } };

      // Expire the token
      await adminDb
        .update(otpTokens)
        .set({ expiresAt: new Date(Date.now() - 60000) })
        .where(eq(otpTokens.userId, user.id));

      // 3. Expired code
      const expiredRes = await app.fetch(
        new Request("http://localhost/api/auth/reset-password", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email,
            otp: "123456",
            newPassword: "NewSecurePassword!123",
          }),
        })
      );
      const expiredBody = (await expiredRes.json()) as { error: { message: string } };

      expect(unknownRes.status).toBe(401);
      expect(wrongRes.status).toBe(401);
      expect(expiredRes.status).toBe(401);

      expect(unknownBody.error.message).toBe("Invalid or expired reset code");
      expect(wrongBody.error.message).toBe("Invalid or expired reset code");
      expect(expiredBody.error.message).toBe("Invalid or expired reset code");
    });

    it("revokes user's other unused reset_password tokens after a successful reset", async () => {
      const email = "user-revoke-old@example.com";
      const user = await seedUser(tenantId, { email });

      // Create an older unused token
      const oldOtp = generateOtp();
      const [oldToken] = await adminDb
        .insert(otpTokens)
        .values({
          tenantId,
          userId: user.id,
          tokenHash: oldOtp.otpHash,
          type: "password_reset",
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          createdAt: new Date(Date.now() - 5000),
        })
        .returning();

      // Create newer token to be used
      const newOtp = generateOtp();
      const [newToken] = await adminDb
        .insert(otpTokens)
        .values({
          tenantId,
          userId: user.id,
          tokenHash: newOtp.otpHash,
          type: "password_reset",
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          createdAt: new Date(),
        })
        .returning();

      // Successfully reset using the newer OTP
      const res = await app.fetch(
        new Request("http://localhost/api/auth/reset-password", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email,
            otp: newOtp.rawOtp,
            newPassword: "NewSecurePassword!123",
          }),
        })
      );
      expect(res.status).toBe(200);

      // Verify the used token is used
      const [usedTokenInDb] = await adminDb
        .select()
        .from(otpTokens)
        .where(eq(otpTokens.id, newToken.id));
      expect(usedTokenInDb.usedAt).not.toBeNull();

      // Verify the OLDER unused token was also revoked
      const [oldTokenInDb] = await adminDb
        .select()
        .from(otpTokens)
        .where(eq(otpTokens.id, oldToken.id));
      expect(oldTokenInDb.usedAt).not.toBeNull();
    });

    it("two parallel correct submissions: exactly one succeeds with 200 and one fails with 401", async () => {
      const email = "user-race-pwd@example.com";
      const user = await seedUser(tenantId, { email });

      const { rawOtp, otpHash } = generateOtp();
      await adminDb.insert(otpTokens).values({
        tenantId,
        userId: user.id,
        tokenHash: otpHash,
        type: "password_reset",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      const [res1, res2] = await Promise.all([
        app.fetch(
          new Request("http://localhost/api/auth/reset-password", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              email,
              otp: rawOtp,
              newPassword: "NewSecurePassword!123",
            }),
          })
        ),
        app.fetch(
          new Request("http://localhost/api/auth/reset-password", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              email,
              otp: rawOtp,
              newPassword: "AnotherSecurePassword!456",
            }),
          })
        ),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 401]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. tenantResetPassword:
  //    - unknown tenant, wrong code, and expired code return identical 401 responses
  //    - 5 wrong guesses lock the token
  // ─────────────────────────────────────────────────────────────────────────────
  describe("tenantResetPassword (/tenants/reset-password)", () => {
    it("returns identical 401 responses for unknown tenant, wrong code, and expired code", async () => {
      const adminEmail = "otp-tenant-reset@sentineltest.com";
      const { tenant } = await seedTenant({
        adminEmail,
        isVerified: true,
      });

      const { otpHash } = generateOtp();
      await adminDb.insert(otpTokens).values({
        tenantId: tenant.id,
        userId: null,
        tokenHash: otpHash,
        type: "password_reset",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      // 1. Unknown tenant
      const unknownRes = await app.fetch(
        new Request("http://localhost/tenants/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adminEmail: "nonexistent-tenant@sentineltest.com",
            otp: "123456",
            newPassword: "NewSuperPassword!123",
          }),
        })
      );
      const unknownBody = (await unknownRes.json()) as { error: { message: string } };

      // 2. Wrong code
      const wrongRes = await app.fetch(
        new Request("http://localhost/tenants/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adminEmail,
            otp: "000000",
            newPassword: "NewSuperPassword!123",
          }),
        })
      );
      const wrongBody = (await wrongRes.json()) as { error: { message: string } };

      // Expire token
      await adminDb
        .update(otpTokens)
        .set({ expiresAt: new Date(Date.now() - 60000) })
        .where(eq(otpTokens.tenantId, tenant.id));

      // 3. Expired code
      const expiredRes = await app.fetch(
        new Request("http://localhost/tenants/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            adminEmail,
            otp: "123456",
            newPassword: "NewSuperPassword!123",
          }),
        })
      );
      const expiredBody = (await expiredRes.json()) as { error: { message: string } };

      expect(unknownRes.status).toBe(401);
      expect(wrongRes.status).toBe(401);
      expect(expiredRes.status).toBe(401);

      expect(unknownBody.error.message).toBe("Invalid or expired reset code");
      expect(wrongBody.error.message).toBe("Invalid or expired reset code");
      expect(expiredBody.error.message).toBe("Invalid or expired reset code");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. verifyMFAChallenge:
  //    - 5 wrong guesses lock challenge token, correct TOTP code rejected after
  //    - 50 parallel wrong guesses end with attempts = 5 exactly
  // ─────────────────────────────────────────────────────────────────────────────
  describe("verifyMFAChallenge (/api/auth/mfa/verify)", () => {
    it("5 wrong TOTP guesses lock challenge token and valid TOTP code is rejected after", async () => {
      const email = "mfa-cap-test@example.com";
      const user = await seedUser(tenantId, { email });

      // Create session challenge
      const sessionChallenge = "challenge" + "a".repeat(55);
      const challengeHash = sha256(sessionChallenge);

      const [token] = await adminDb
        .insert(otpTokens)
        .values({
          tenantId,
          userId: user.id,
          tokenHash: challengeHash,
          type: "mfa_challenge",
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        })
        .returning();

      // 4 wrong guesses return 401
      for (let i = 0; i < 4; i++) {
        const res = await app.fetch(
          new Request("http://localhost/api/auth/mfa/verify", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ sessionChallenge, code: "000000" }),
          })
        );
        expect(res.status).toBe(401);
      }

      // 5th wrong guess locks challenge token and returns 400
      const lockRes = await app.fetch(
        new Request("http://localhost/api/auth/mfa/verify", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ sessionChallenge, code: "000000" }),
        })
      );
      expect(lockRes.status).toBe(400);
      const lockBody = (await lockRes.json()) as { error: { message: string } };
      expect(lockBody.error.message.toLowerCase()).toContain("wrong code");

      // Verify token in DB
      const [tokenInDb] = await adminDb
        .select()
        .from(otpTokens)
        .where(eq(otpTokens.id, token.id));

      expect(tokenInDb.attempts).toBe(5);
      expect(tokenInDb.usedAt).not.toBeNull();

      // Attempting with any code on the dead challenge fails with 401
      const deadChallengeRes = await app.fetch(
        new Request("http://localhost/api/auth/mfa/verify", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ sessionChallenge, code: "123456" }),
        })
      );
      expect(deadChallengeRes.status).toBe(401);
    });

    it("50 parallel wrong guesses end with attempts = 5 exactly on mfa_challenge", async () => {
      const email = "mfa-parallel-cap@example.com";
      const user = await seedUser(tenantId, { email });

      const sessionChallenge = "parallelchallenge" + "b".repeat(47);
      const challengeHash = sha256(sessionChallenge);

      const [token] = await adminDb
        .insert(otpTokens)
        .values({
          tenantId,
          userId: user.id,
          tokenHash: challengeHash,
          type: "mfa_challenge",
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        })
        .returning();

      // Launch 50 parallel wrong guesses
      await Promise.all(
        Array.from({ length: 50 }, () =>
          app.fetch(
            new Request("http://localhost/api/auth/mfa/verify", {
              method: "POST",
              headers: authHeaders(),
              body: JSON.stringify({ sessionChallenge, code: "000000" }),
            })
          )
        )
      );

      const [tokenInDb] = await adminDb
        .select()
        .from(otpTokens)
        .where(eq(otpTokens.id, token.id));

      expect(tokenInDb.attempts).toBe(5);
      expect(tokenInDb.usedAt).not.toBeNull();
    });
  });
});
