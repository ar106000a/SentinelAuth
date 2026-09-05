import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { tenants, users, otpTokens, riskLogs } from "../db/schema/index.js";
import { and, eq } from "drizzle-orm";
import { seedTenant, cleanupTenants } from "./utils/seed.js";
import { generateOtp } from "../utils/crypto.js";
import type { ApiSuccessResponse } from "@sentinelauth/types";

vi.mock("../services/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_EMAIL = "analytics-test-tenant@sentineltest.com";
const DASHBOARD_PASSWORD = "SuperSecure!Password123";
const USER_EMAIL = "analytics-user@example.com";
const USER_PASSWORD = "SecureUser!123";

let tenantId: string;        // API tenant — owns the user + their risk_logs
let tenantSecret: string;
let sessionCookie: string;
let dashboardTenantId: string; // Dashboard tenant — what the session cookie scopes to

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dashboardHeaders() {
  return { Cookie: sessionCookie };
}

function apiHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${tenantSecret}`,
  };
}

async function createVerifiedUser(email: string, password: string) {
  await app.fetch(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: apiHeaders(),
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
      and(eq(otpTokens.userId, user.id), eq(otpTokens.type, "email_verification"))
    );

  await app.fetch(
    new Request("http://localhost/api/auth/verify-email", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ email, otp: rawOtp }),
    })
  );
}

async function loginUser(email: string, password: string) {
  return app.fetch(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ email, password }),
    })
  );
}

async function loginDashboard() {
  // Register the dashboard tenant via HTTP (creates a real bcrypt password hash).
  // A 409 means it already exists from a previous test run — that's fine.
  await app.fetch(
    new Request("http://localhost/tenants/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Analytics Test Corp",
        adminEmail: TENANT_EMAIL,
        password: DASHBOARD_PASSWORD,
      }),
    })
  );

  // Force-verify regardless (idempotent)
  await adminDb
    .update(tenants)
    .set({ isVerified: true, settings: { riskThreshold: 0.7, failOpen: true } })
    .where(eq(tenants.adminEmail, TENANT_EMAIL));

  const res = await app.fetch(
    new Request("http://localhost/dashboard/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminEmail: TENANT_EMAIL, password: DASHBOARD_PASSWORD }),
    })
  );
  const cookie = res.headers.get("set-cookie")!;
  return cookie.split(";")[0];
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // API tenant — seeded directly in DB with a known secret key
  // (used for /api/auth/* routes which require the raw secret key in the Bearer token)
  const seeded = await seedTenant({ adminEmail: `api-${TENANT_EMAIL}`, isVerified: true });
  tenantId = seeded.tenant.id;
  tenantSecret = seeded.rawSecret;

  // Create and verify a user under the API tenant
  await createVerifiedUser(USER_EMAIL, USER_PASSWORD);

  // Produce risk_log rows for the API tenant:
  // 1) Successful login → login_success
  await loginUser(USER_EMAIL, USER_PASSWORD);
  // 2) Failed login (wrong password) → login_failed
  await loginUser(USER_EMAIL, "WRONG_PASSWORD");

  // Dashboard tenant — registered via HTTP so password is properly hashed
  sessionCookie = await loginDashboard();

  // Resolve the dashboard tenant's ID so we can scope DB assertions to it
  const [dashTenant] = await adminDb
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.adminEmail, TENANT_EMAIL));
  dashboardTenantId = dashTenant.id;

  // Seed synthetic risk_log rows directly for the dashboard tenant so that
  // the login-volume "today's events" test has data scoped to the right tenant.
  await adminDb.insert(riskLogs).values([
    { tenantId: dashboardTenantId, eventType: "login_success", mfaTriggered: false },
    { tenantId: dashboardTenantId, eventType: "login_failed",  mfaTriggered: false },
    { tenantId: dashboardTenantId, eventType: "mfa_triggered", mfaTriggered: true  },
  ]);
});

afterAll(async () => {
  await cleanupTenants([TENANT_EMAIL, `api-${TENANT_EMAIL}`]);
});

// ─── GET /dashboard/analytics/login-volume ────────────────────────────────────

describe("GET /dashboard/analytics/login-volume", () => {
  it("returns 200 with a buckets array", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/analytics/login-volume", {
        headers: dashboardHeaders(),
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<{
      buckets: { date: string; count: number }[];
    }>;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.buckets)).toBe(true);
  });

  it("buckets contain at least one entry covering today's events", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await app.fetch(
      new Request(
        `http://localhost/dashboard/analytics/login-volume?fromDate=${today}&toDate=${today}&granularity=day`,
        { headers: dashboardHeaders() }
      )
    );

    const body = (await res.json()) as ApiSuccessResponse<{
      buckets: { date: string; count: number }[];
    }>;
    expect(res.status).toBe(200);
    // At least the successful login + failed login were seeded today
    const total = body.data.buckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBeGreaterThanOrEqual(2);
  });

  it("returns empty buckets for a date range with no events", async () => {
    const res = await app.fetch(
      new Request(
        "http://localhost/dashboard/analytics/login-volume?fromDate=2000-01-01&toDate=2000-01-02",
        { headers: dashboardHeaders() }
      )
    );

    const body = (await res.json()) as ApiSuccessResponse<{
      buckets: { date: string; count: number }[];
    }>;
    expect(res.status).toBe(200);
    expect(body.data.buckets).toHaveLength(0);
  });

  it("defaults granularity to day when omitted", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await app.fetch(
      new Request(
        `http://localhost/dashboard/analytics/login-volume?fromDate=${today}&toDate=${today}`,
        { headers: dashboardHeaders() }
      )
    );
    expect(res.status).toBe(200);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/analytics/login-volume")
    );
    expect(res.status).toBe(401);
  });

  it("rejects invalid granularity with 400", async () => {
    const res = await app.fetch(
      new Request(
        "http://localhost/dashboard/analytics/login-volume?granularity=minute",
        { headers: dashboardHeaders() }
      )
    );
    expect(res.status).toBe(400);
  });
});

// ─── GET /dashboard/analytics/mfa-rate ───────────────────────────────────────

describe("GET /dashboard/analytics/mfa-rate", () => {
  it("returns 200 with totalLogins, mfaTriggeredCount, and rate", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/analytics/mfa-rate", {
        headers: dashboardHeaders(),
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<{
      totalLogins: number;
      mfaTriggeredCount: number;
      rate: number;
    }>;
    expect(body.success).toBe(true);
    expect(typeof body.data.totalLogins).toBe("number");
    expect(typeof body.data.mfaTriggeredCount).toBe("number");
    expect(typeof body.data.rate).toBe("number");
  });

  it("rate is a number between 0 and 1", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/analytics/mfa-rate", {
        headers: dashboardHeaders(),
      })
    );
    const body = (await res.json()) as ApiSuccessResponse<{ rate: number }>;
    expect(body.data.rate).toBeGreaterThanOrEqual(0);
    expect(body.data.rate).toBeLessThanOrEqual(1);
  });

  it("rate is 0 and counts are 0 when no events in range", async () => {
    const res = await app.fetch(
      new Request(
        "http://localhost/dashboard/analytics/mfa-rate?fromDate=2000-01-01&toDate=2000-01-02",
        { headers: dashboardHeaders() }
      )
    );
    const body = (await res.json()) as ApiSuccessResponse<{
      totalLogins: number;
      mfaTriggeredCount: number;
      rate: number;
    }>;
    expect(res.status).toBe(200);
    expect(body.data.totalLogins).toBe(0);
    expect(body.data.mfaTriggeredCount).toBe(0);
    expect(body.data.rate).toBe(0);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/analytics/mfa-rate")
    );
    expect(res.status).toBe(401);
  });
});

// ─── GET /dashboard/analytics/risk-distribution ───────────────────────────────

describe("GET /dashboard/analytics/risk-distribution", () => {
  it("returns 200 with exactly 5 buckets", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/analytics/risk-distribution", {
        headers: dashboardHeaders(),
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as ApiSuccessResponse<{
      buckets: { min: number; max: number; count: number }[];
    }>;
    expect(body.success).toBe(true);
    expect(body.data.buckets).toHaveLength(5);
  });

  it("each bucket has min, max, and count fields", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/analytics/risk-distribution", {
        headers: dashboardHeaders(),
      })
    );
    const body = (await res.json()) as ApiSuccessResponse<{
      buckets: { min: number; max: number; count: number }[];
    }>;
    for (const bucket of body.data.buckets) {
      expect(typeof bucket.min).toBe("number");
      expect(typeof bucket.max).toBe("number");
      expect(typeof bucket.count).toBe("number");
      expect(bucket.count).toBeGreaterThanOrEqual(0);
    }
  });

  it("always returns all 5 bands even for a date range with no scored events", async () => {
    const res = await app.fetch(
      new Request(
        "http://localhost/dashboard/analytics/risk-distribution?fromDate=2000-01-01&toDate=2000-01-02",
        { headers: dashboardHeaders() }
      )
    );
    const body = (await res.json()) as ApiSuccessResponse<{
      buckets: { min: number; max: number; count: number }[];
    }>;
    expect(res.status).toBe(200);
    expect(body.data.buckets).toHaveLength(5);
    for (const b of body.data.buckets) {
      expect(b.count).toBe(0);
    }
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/analytics/risk-distribution")
    );
    expect(res.status).toBe(401);
  });
});

// ─── Auth service — wrong-password writes to risk_logs ────────────────────────

describe("Wrong-password login writes login_failed to risk_logs", () => {
  it("a login_failed row exists for the tenant after a bad password attempt", async () => {
    const rows = await adminDb
      .select()
      .from(riskLogs)
      .where(
        and(
          eq(riskLogs.tenantId, tenantId),
          eq(riskLogs.eventType, "login_failed")
        )
      );

    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it("the login_failed row has mfaTriggered = false", async () => {
    const [row] = await adminDb
      .select()
      .from(riskLogs)
      .where(
        and(
          eq(riskLogs.tenantId, tenantId),
          eq(riskLogs.eventType, "login_failed")
        )
      );

    expect(row.mfaTriggered).toBe(false);
  });

  it("writing a fresh bad-password attempt adds another login_failed row", async () => {
    const before = await adminDb
      .select()
      .from(riskLogs)
      .where(
        and(
          eq(riskLogs.tenantId, tenantId),
          eq(riskLogs.eventType, "login_failed")
        )
      );

    await loginUser(USER_EMAIL, "another_wrong_password");

    const after = await adminDb
      .select()
      .from(riskLogs)
      .where(
        and(
          eq(riskLogs.tenantId, tenantId),
          eq(riskLogs.eventType, "login_failed")
        )
      );

    expect(after.length).toBeGreaterThanOrEqual(before.length + 1);
  });
});
