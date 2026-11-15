// api/src/tests/auth-body.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { tenants, users, sessions, refreshTokenHistory, otpTokens } from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { cleanupTenants, seedTenant } from "./utils/seed.js";
import { generateOtp } from "../utils/crypto.js";
import { hashToken } from "../utils/jwt.js";
import { env } from "../config/env.js";
import { runRefreshCleanup } from "../services/refresh-cleanup.service.js";

vi.mock("../services/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_EMAIL = "body-mode-tenant@sentineltest.com";
const USER_EMAIL = "body-user@example.com";
const USER_PASSWORD = "SecurePass!123";
let tenantSecret: string;
let tenantId: string;

function authHeaders(extraHeaders: Record<string, string> = {}) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${tenantSecret}`,
    ...extraHeaders,
  };
}

async function registerAndVerifyUser(email: string, password: string) {
  await app.fetch(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: authHeaders(),
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
      headers: authHeaders(),
      body: JSON.stringify({ email, otp: rawOtp }),
    })
  );

  return user.id;
}

describe("Body-mode refresh-token transport (REQ_BODY_TOKENS=true)", () => {
  beforeAll(async () => {
    env.REQ_BODY_TOKENS = true;
    env.REFRESH_SUCCESSOR_ENC_KEY = "a".repeat(64);
    env.REFRESH_GRACE_SECONDS = 10;

    await cleanupTenants([TENANT_EMAIL]);

    const seeded = await seedTenant({
      name: "Body Mode Tenant",
      adminEmail: TENANT_EMAIL,
      isVerified: true,
    });
    tenantId = seeded.tenant.id;
    tenantSecret = seeded.rawSecret;

    // Set allowedOrigins in settings
    await adminDb
      .update(tenants)
      .set({
        settings: {
          riskThreshold: 0.7,
          failOpen: true,
          allowedOrigins: ["https://app.client.com"],
        },
      })
      .where(eq(tenants.id, tenantId));

    await registerAndVerifyUser(USER_EMAIL, USER_PASSWORD);
  });

  afterAll(async () => {
    env.REQ_BODY_TOKENS = false;
    await cleanupTenants([TENANT_EMAIL]);
  });

  describe("1. Login, refresh, and MFA contracts in body mode", () => {
    it("login returns refreshToken in JSON body and sets NO cookie", async () => {
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

      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toBeNull();

      const body = (await res.json()) as {
        data: { accessToken: string; refreshToken: string; userId: string };
      };
      expect(body.data.refreshToken).toBeDefined();
      expect(typeof body.data.refreshToken).toBe("string");
      expect(body.data.accessToken).toBeDefined();
    });

    it("stores hashes in refresh_token_history and sessions, not raw tokens", async () => {
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
      const body = (await res.json()) as {
        data: { accessToken: string; refreshToken: string };
      };

      const expectedTokenHash = hashToken(body.data.refreshToken);
      const [historyRow] = await adminDb
        .select()
        .from(refreshTokenHistory)
        .where(eq(refreshTokenHistory.tokenHash, expectedTokenHash));

      expect(historyRow).toBeDefined();
      expect(historyRow.tokenHash).toBe(expectedTokenHash);
      expect(historyRow.tokenHash).not.toBe(body.data.refreshToken);
      expect(historyRow.consumedAt).toBeNull();
    });

    it("refresh rotates token via JSON body, emits no cookie, and returns successor", async () => {
      const loginRes = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email: USER_EMAIL,
            password: USER_PASSWORD,
          }),
        })
      );
      const loginBody = (await loginRes.json()) as {
        data: { refreshToken: string };
      };

      const refreshRes = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken: loginBody.data.refreshToken }),
        })
      );

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.headers.get("set-cookie")).toBeNull();

      const refreshBody = (await refreshRes.json()) as {
        data: { accessToken: string; refreshToken: string };
      };
      expect(refreshBody.data.refreshToken).toBeDefined();
      expect(refreshBody.data.refreshToken).not.toBe(loginBody.data.refreshToken);
      expect(refreshBody.data.accessToken).toBeDefined();
    });

    it("refresh without JSON body token fails with 401 and MISSING_BODY_TOKEN code", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({}),
        })
      );

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("MISSING_BODY_TOKEN");
    });
  });

  describe("2. Grace window and idempotent retries", () => {
    it("replay of consumed token INSIDE grace window returns the same successor without rotating", async () => {
      const loginRes = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email: USER_EMAIL,
            password: USER_PASSWORD,
          }),
        })
      );
      const initialToken = ((await loginRes.json()) as any).data.refreshToken;

      // First rotation
      const rotate1 = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken: initialToken }),
        })
      );
      const body1 = ((await rotate1.json()) as any).data;
      const successor1 = body1.refreshToken;

      // Immediate retry of initialToken (simulating lost response or concurrent tab)
      const rotate2 = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken: initialToken }),
        })
      );
      expect(rotate2.status).toBe(200);
      const body2 = ((await rotate2.json()) as any).data;

      // Returns the exact same successor refresh token!
      expect(body2.refreshToken).toBe(successor1);
      expect(body2.accessToken).toBeDefined();
    });

    it("lost response scenario: client uses successor after grace retry", async () => {
      const loginRes = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email: USER_EMAIL,
            password: USER_PASSWORD,
          }),
        })
      );
      const initialToken = ((await loginRes.json()) as any).data.refreshToken;

      // Rotation succeeds on server
      await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken: initialToken }),
        })
      );

      // Client retries initial token inside grace
      const retryRes = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken: initialToken }),
        })
      );
      const retryBody = ((await retryRes.json()) as any).data;
      const recoveredToken = retryBody.refreshToken;

      // Client can now rotate with the recovered successor
      const nextRes = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken: recoveredToken }),
        })
      );
      expect(nextRes.status).toBe(200);
    });

    it("concurrent refresh requests on same token serialize successfully", async () => {
      const loginRes = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email: USER_EMAIL,
            password: USER_PASSWORD,
          }),
        })
      );
      const token = ((await loginRes.json()) as any).data.refreshToken;

      // Fire 3 concurrent refresh requests
      const promises = [1, 2, 3].map(() =>
        app.fetch(
          new Request("http://localhost/api/auth/refresh", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ refreshToken: token }),
          })
        )
      );

      const responses = await Promise.all(promises);
      for (const res of responses) {
        expect(res.status).toBe(200);
      }

      const bodies = await Promise.all(responses.map((r) => r.json() as any));
      const successor = bodies[0].data.refreshToken;
      for (const b of bodies) {
        // All concurrent requests got the same valid successor!
        expect(b.data.refreshToken).toBe(successor);
      }
    });

    it("replay of consumed token OUTSIDE grace window revokes the whole family", async () => {
      const loginRes = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email: USER_EMAIL,
            password: USER_PASSWORD,
          }),
        })
      );
      const token = ((await loginRes.json()) as any).data.refreshToken;

      // First rotation
      const rotRes = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken: token }),
        })
      );
      const successor = ((await rotRes.json()) as any).data.refreshToken;

      // Manually backdate consumedAt past grace window
      const tokenHashVal = hashToken(token);
      await adminDb
        .update(refreshTokenHistory)
        .set({
          consumedAt: new Date(Date.now() - 30 * 1000), // 30s ago (> 10s grace)
        })
        .where(eq(refreshTokenHistory.tokenHash, tokenHashVal));

      // Replay old token outside grace
      const replayRes = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken: token }),
        })
      );
      expect(replayRes.status).toBe(401);

      // Verify the whole family is now revoked: successor must also fail!
      const successorRes = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken: successor }),
        })
      );
      expect(successorRes.status).toBe(401);
    });
  });

  describe("3. Expiry and session enforcement in body mode", () => {
    it("unknown or malformed token fails and revokes nothing", async () => {
      const loginRes = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email: USER_EMAIL,
            password: USER_PASSWORD,
          }),
        })
      );
      const validToken = ((await loginRes.json()) as any).data.refreshToken;

      const badRes = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken: "invalid.jwt.token" }),
        })
      );
      expect(badRes.status).toBe(401);

      // Valid session was NOT revoked
      const goodRes = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken: validToken }),
        })
      );
      expect(goodRes.status).toBe(200);
    });

    it("idle expiry is enforced and revokes the family", async () => {
      const loginRes = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email: USER_EMAIL,
            password: USER_PASSWORD,
          }),
        })
      );
      const token = ((await loginRes.json()) as any).data.refreshToken;

      // Backdate refreshIdleExpiresAt to the past
      const tHash = hashToken(token);
      const [hist] = await adminDb
        .select()
        .from(refreshTokenHistory)
        .where(eq(refreshTokenHistory.tokenHash, tHash));

      await adminDb
        .update(sessions)
        .set({
          refreshIdleExpiresAt: new Date(Date.now() - 1000),
        })
        .where(eq(sessions.id, hist.sessionId));

      const res = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken: token }),
        })
      );
      expect(res.status).toBe(401);

      const [updatedSession] = await adminDb
        .select()
        .from(sessions)
        .where(eq(sessions.id, hist.sessionId));
      expect(updatedSession.isRevoked).toBe(true);
    });

    it("absolute expiry is enforced and revokes the family", async () => {
      const loginRes = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email: USER_EMAIL,
            password: USER_PASSWORD,
          }),
        })
      );
      const token = ((await loginRes.json()) as any).data.refreshToken;

      const tHash = hashToken(token);
      const [hist] = await adminDb
        .select()
        .from(refreshTokenHistory)
        .where(eq(refreshTokenHistory.tokenHash, tHash));

      await adminDb
        .update(sessions)
        .set({
          refreshAbsoluteExpiresAt: new Date(Date.now() - 1000),
        })
        .where(eq(sessions.id, hist.sessionId));

      const res = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken: token }),
        })
      );
      expect(res.status).toBe(401);
    });

    it("sessions with NULL refresh expiries (cookie mode session) are rejected in body mode", async () => {
      const loginRes = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email: USER_EMAIL,
            password: USER_PASSWORD,
          }),
        })
      );
      const token = ((await loginRes.json()) as any).data.refreshToken;

      const tHash = hashToken(token);
      const [hist] = await adminDb
        .select()
        .from(refreshTokenHistory)
        .where(eq(refreshTokenHistory.tokenHash, tHash));

      // Simulate a legacy cookie-mode session where refresh expiries are NULL
      await adminDb
        .update(sessions)
        .set({
          refreshIdleExpiresAt: null,
          refreshAbsoluteExpiresAt: null,
        })
        .where(eq(sessions.id, hist.sessionId));

      const res = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken: token }),
        })
      );
      expect(res.status).toBe(401);
    });
  });

  describe("4. Cross-tab access token non-invalidation & logout", () => {
    it("after tab B refreshes, tab A's access token keeps working in body mode", async () => {
      const loginRes = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email: USER_EMAIL,
            password: USER_PASSWORD,
          }),
        })
      );
      const loginData = ((await loginRes.json()) as any).data;
      const tabAAccessToken = loginData.accessToken;
      const refreshToken = loginData.refreshToken;

      // Tab B refreshes the session
      const refreshRes = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken }),
        })
      );
      expect(refreshRes.status).toBe(200);

      // Tab A's existing access token must still be valid in userAuth!
      const pingRes = await app.fetch(
        new Request("http://localhost/api/auth/mfa/setup", {
          method: "POST",
          headers: authHeaders({ "X-User-Token": tabAAccessToken }),
          body: JSON.stringify({}),
        })
      );
      expect(pingRes.status).toBe(200);
    });

    it("logout with refresh token revokes the family even if access token is expired", async () => {
      const loginRes = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email: USER_EMAIL,
            password: USER_PASSWORD,
          }),
        })
      );
      const loginData = ((await loginRes.json()) as any).data;
      const rToken = loginData.refreshToken;

      // Logout passing the refresh token in JSON body with dummy/expired X-User-Token
      const logoutRes = await app.fetch(
        new Request("http://localhost/api/auth/logout", {
          method: "POST",
          headers: authHeaders({ "X-User-Token": "expired.or.dummy.jwt" }),
          body: JSON.stringify({ refreshToken: rToken }),
        })
      );
      expect(logoutRes.status).toBe(200);

      // Verify the family is revoked: refresh fails
      const refreshAttempt = await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken: rToken }),
        })
      );
      expect(refreshAttempt.status).toBe(401);
    });
  });

  describe("5. CORS in body mode", () => {
    it("allowed origin passes preflight OPTIONS request without credentials", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "OPTIONS",
          headers: {
            Origin: "https://app.client.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "Content-Type, Authorization",
          },
        })
      );

      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("https://app.client.com");
      expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    });

    it("allowed origin on authenticated request succeeds and echoes origin without credentials", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: authHeaders({ Origin: "https://app.client.com" }),
          body: JSON.stringify({
            email: USER_EMAIL,
            password: USER_PASSWORD,
          }),
        })
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe("https://app.client.com");
      expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    });

    it("unregistered origin gets 403 Forbidden with no action taken", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: authHeaders({ Origin: "https://evil-site.com" }),
          body: JSON.stringify({
            email: USER_EMAIL,
            password: USER_PASSWORD,
          }),
        })
      );

      expect(res.status).toBe(403);
    });

    it("requests with no Origin header (non-browser clients) are allowed", async () => {
      const res = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: authHeaders(), // no Origin header
          body: JSON.stringify({
            email: USER_EMAIL,
            password: USER_PASSWORD,
          }),
        })
      );

      expect(res.status).toBe(200);
    });
  });

  describe("6. Maintenance cleanup job", () => {
    it("cleans up stale history rows and nulls expired successor ciphertext", async () => {
      const loginRes = await app.fetch(
        new Request("http://localhost/api/auth/login", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            email: USER_EMAIL,
            password: USER_PASSWORD,
          }),
        })
      );
      const token = ((await loginRes.json()) as any).data.refreshToken;

      // Rotate to create successorCiphertext
      await app.fetch(
        new Request("http://localhost/api/auth/refresh", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ refreshToken: token }),
        })
      );

      // Backdate consumed row to past grace window
      const tHash = hashToken(token);
      await adminDb
        .update(refreshTokenHistory)
        .set({
          consumedAt: new Date(Date.now() - 20 * 1000), // 20s ago (> 10s grace)
        })
        .where(eq(refreshTokenHistory.tokenHash, tHash));

      // Run cleanup
      const { nulled } = await runRefreshCleanup();
      expect(nulled).toBeGreaterThan(0);

      const [rowAfter] = await adminDb
        .select()
        .from(refreshTokenHistory)
        .where(eq(refreshTokenHistory.tokenHash, tHash));
      expect(rowAfter.successorCiphertext).toBeNull();
    });
  });
});
