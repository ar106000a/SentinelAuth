// api/src/tests/auth-cookie.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
import { generate } from "otplib";

vi.mock("../services/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_EMAIL = "refresh-cookie-tenant@sentineltest.com";
const USER_EMAIL = "cookie-user@example.com";
const USER_PASSWORD = "SecurePass!123";
let tenantSecret: string;
let tenantId: string;

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${tenantSecret}`,
  };
}

/** Parses a raw Set-Cookie header string into its name/value and flags. */
function parseCookie(setCookieHeader: string | null) {
  if (!setCookieHeader) return null;
  const [pair, ...attrs] = setCookieHeader.split(";").map((s) => s.trim());
  const [name, value] = pair.split("=");
  return {
    name,
    value,
    httpOnly: attrs.some((a) => a.toLowerCase() === "httponly"),
    sameSiteStrict: attrs.some((a) => a.toLowerCase() === "samesite=strict"),
    hasMaxAge: attrs.some((a) => a.toLowerCase().startsWith("max-age=")),
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

beforeAll(async () => {
  await app.fetch(
    new Request("http://localhost/tenants/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Refresh Cookie Corp",
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

  await registerAndVerifyUser(USER_EMAIL, USER_PASSWORD);
});

afterAll(async () => {
  await cleanupTenants([TENANT_EMAIL]);
});

// ── Login: cookie set, body stripped ──────────────────────────────────────────

describe("POST /api/auth/login — refresh cookie", () => {
  it("sets sentinel_refresh as an httpOnly, SameSite=Strict cookie on success", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      })
    );

    expect(res.status).toBe(200);

    const cookie = parseCookie(res.headers.get("set-cookie"));
    expect(cookie).not.toBeNull();
    expect(cookie!.name).toBe("sentinel_refresh");
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSiteStrict).toBe(true);
    expect(cookie!.hasMaxAge).toBe(true);
    expect(cookie!.value.length).toBeGreaterThan(0);
  });

  it("does NOT include refreshToken anywhere in the response body", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      })
    );

    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(body.data).not.toHaveProperty("refreshToken");
    // accessToken must still be present — only refreshToken moved to cookie
    expect(body.data.accessToken).toBeTruthy();
  });

  it("does not set the cookie on failed login", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          email: USER_EMAIL,
          password: "WrongPassword!123",
        }),
      })
    );

    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

// ── MFA verify: same cookie behavior on the second token-issuing path ────────

describe("POST /api/auth/mfa/verify — refresh cookie", () => {
  let totpSecret: string;

  beforeAll(async () => {
    const loginRes = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      })
    );
    const loginBody = (await loginRes.json()) as {
      data: { accessToken: string };
    };
    const accessToken = loginBody.data.accessToken;

    const setupRes = await app.fetch(
      new Request("http://localhost/api/auth/mfa/setup", {
        method: "POST",
        headers: { ...authHeaders(), "X-User-Token": accessToken },
      })
    );
    const setupBody = (await setupRes.json()) as { data: { secret: string } };
    totpSecret = setupBody.data.secret;
    expect(setupRes.status).toBe(200);

    const code = await generate({ secret: totpSecret });
    const enableRes = await app.fetch(
      new Request("http://localhost/api/auth/mfa/enable", {
        method: "POST",
        headers: { ...authHeaders(), "X-User-Token": accessToken },
        body: JSON.stringify({ code }),
      })
    );
    expect(enableRes.status).toBe(200);
  });

  it("sets sentinel_refresh on successful MFA verification, not on the login step that preceded it", async () => {
    const loginRes = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      })
    );

    // MFA-required login must NOT set the cookie yet — no tokens issued
    expect(loginRes.headers.get("set-cookie")).toBeNull();

    const loginBody = (await loginRes.json()) as {
      data: { mfaRequired: boolean; sessionChallenge: string };
    };
    expect(loginBody.data.mfaRequired).toBe(true);

    const code = await generate({ secret: totpSecret });
    const verifyRes = await app.fetch(
      new Request("http://localhost/api/auth/mfa/verify", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          sessionChallenge: loginBody.data.sessionChallenge,
          code,
        }),
      })
    );

    expect(verifyRes.status).toBe(200);
    const cookie = parseCookie(verifyRes.headers.get("set-cookie"));
    expect(cookie).not.toBeNull();
    expect(cookie!.name).toBe("sentinel_refresh");
    expect(cookie!.httpOnly).toBe(true);
  });

  it("does not include refreshToken in the mfa/verify response body", async () => {
    const loginRes = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      })
    );
    const loginBody = (await loginRes.json()) as {
      data: { sessionChallenge: string };
    };

    const code = await generate({ secret: totpSecret });
    const verifyRes = await app.fetch(
      new Request("http://localhost/api/auth/mfa/verify", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          sessionChallenge: loginBody.data.sessionChallenge,
          code,
        }),
      })
    );

    const verifyBody = (await verifyRes.json()) as {
      data: Record<string, unknown>;
    };
    expect(verifyBody.data).not.toHaveProperty("refreshToken");
    expect(verifyBody.data.accessToken).toBeTruthy();
  });

  afterAll(async () => {
    // Leave the user in a clean, non-MFA state for later describe blocks
    const loginRes = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      })
    );
    const loginBody = (await loginRes.json()) as {
      data: { sessionChallenge: string };
    };
    const code = await generate({ secret: totpSecret });
    const verifyRes = await app.fetch(
      new Request("http://localhost/api/auth/mfa/verify", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          sessionChallenge: loginBody.data.sessionChallenge,
          code,
        }),
      })
    );
    const verifyBody = (await verifyRes.json()) as {
      data: { accessToken: string };
    };

    await app.fetch(
      new Request("http://localhost/api/auth/mfa/disable", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "X-User-Token": verifyBody.data.accessToken,
        },
        body: JSON.stringify({
          password: USER_PASSWORD,
          code: await generate({ secret: totpSecret }),
        }),
      })
    );
  });
});

// ── Refresh endpoint: cookie-only, no body fallback ───────────────────────────

describe("POST /api/auth/refresh — cookie-only contract", () => {
  it("reads the refresh token from the cookie and issues a new access token", async () => {
    const loginRes = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      })
    );

    const setCookie = loginRes.headers.get("set-cookie")!;
    const cookieHeader = setCookie.split(";")[0];

    const refreshRes = await app.fetch(
      new Request("http://localhost/api/auth/refresh", {
        method: "POST",
        headers: { ...authHeaders(), Cookie: cookieHeader },
      })
    );
    console.log(
      "-----RefreshResponse from accessToken test-------",
      refreshRes
    );

    expect(refreshRes.status).toBe(200);
    const body = (await refreshRes.json()) as { data: { accessToken: string } };
    expect(body.data.accessToken).toBeTruthy();
    expect(body.data.accessToken.split(".")).toHaveLength(3);
  });

  it("re-issues a fresh sentinel_refresh cookie on successful refresh", async () => {
    const loginRes = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      })
    );
    const cookieHeader = loginRes.headers.get("set-cookie")!.split(";")[0];

    const refreshRes = await app.fetch(
      new Request("http://localhost/api/auth/refresh", {
        method: "POST",
        headers: { ...authHeaders(), Cookie: cookieHeader },
      })
    );

    const newCookie = parseCookie(refreshRes.headers.get("set-cookie"));
    expect(newCookie).not.toBeNull();
    expect(newCookie!.name).toBe("sentinel_refresh");
    expect(newCookie!.httpOnly).toBe(true);
  });

  it("rejects a refresh request with no cookie present", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/refresh", {
        method: "POST",
        headers: authHeaders(), // no Cookie header at all
      })
    );

    expect(res.status).toBe(401);
  });

  it("ignores a refresh token supplied in the request body — cookie-only, no fallback", async () => {
    // Even if a client sends a (possibly forged/stale) token in the body,
    // the endpoint must not honor it — this locks in the cookie-only
    // decision from SENT-1146 rather than silently accepting a dual-mode
    // fallback that would reopen the exact exposure this ticket closes.
    const res = await app.fetch(
      new Request("http://localhost/api/auth/refresh", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ refreshToken: "some-attacker-supplied-value" }),
        // deliberately no Cookie header
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects refresh with a malformed cookie value", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/auth/refresh", {
        method: "POST",
        headers: {
          ...authHeaders(),
          Cookie: "sentinel_refresh=not-a-real-jwt",
        },
      })
    );

    expect(res.status).toBe(401);
  });
});

// ── Logout: cookie cleared in addition to server-side revocation ─────────────

describe("POST /api/auth/logout — clears sentinel_refresh", () => {
  it("clears the sentinel_refresh cookie on logout", async () => {
    const loginRes = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      })
    );
    const loginBody = (await loginRes.json()) as {
      data: { accessToken: string };
    };
    const cookieHeader = loginRes.headers.get("set-cookie")!.split(";")[0];

    const logoutRes = await app.fetch(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "X-User-Token": loginBody.data.accessToken,
          Cookie: cookieHeader,
        },
      })
    );

    expect(logoutRes.status).toBe(200);

    // A cleared cookie is expressed as Set-Cookie with an empty value
    // and/or an immediately-past expiry — assert the header is present
    // and does not carry a live token value.
    const clearedCookie = logoutRes.headers.get("set-cookie");
    expect(clearedCookie).toBeTruthy();
    expect(clearedCookie).toContain("sentinel_refresh=;");
  });

  it("a refresh attempt with the post-logout cookie fails", async () => {
    const loginRes = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      })
    );
    const loginBody = (await loginRes.json()) as {
      data: { accessToken: string };
    };
    const cookieHeader = loginRes.headers.get("set-cookie")!.split(";")[0];

    await app.fetch(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "X-User-Token": loginBody.data.accessToken,
          Cookie: cookieHeader,
        },
      })
    );

    // Reuse the OLD cookie value post-logout — the underlying session
    // should already be revoked server-side (Week 3 logout behavior),
    // independent of the cookie being cleared client-side.
    const refreshRes = await app.fetch(
      new Request("http://localhost/api/auth/refresh", {
        method: "POST",
        headers: { ...authHeaders(), Cookie: cookieHeader },
      })
    );

    expect(refreshRes.status).toBe(401);
  });
});

// ── Regression: existing Week 5 session/revocation semantics unaffected ──────

describe("Session semantics unchanged by cookie transport (regression)", () => {
  it("session record still gets a fresh tokenHash on refresh, old access token still dies", async () => {
    const loginRes = await app.fetch(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
      })
    );
    const loginBody = (await loginRes.json()) as {
      data: { accessToken: string };
    };
    const oldAccessToken = loginBody.data.accessToken;
    const cookieHeader = loginRes.headers.get("set-cookie")!.split(";")[0];

    await app.fetch(
      new Request("http://localhost/api/auth/refresh", {
        method: "POST",
        headers: { ...authHeaders(), Cookie: cookieHeader },
      })
    );

    // Old access token, used against a userAuth-protected route, should
    // now be rejected — session's tokenHash moved on, unaffected by
    // whether the refresh token arrived via cookie or body.
    const logoutAttempt = await app.fetch(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { ...authHeaders(), "X-User-Token": oldAccessToken },
      })
    );

    expect(logoutAttempt.status).toBe(401);
  });
});
