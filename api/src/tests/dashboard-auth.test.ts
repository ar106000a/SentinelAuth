import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { tenants } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { cleanupTenants } from "./utils/seed.js";
import type {
  TenantLoginResponse,
  DashboardMeResponse,
  ApiSuccessResponse,
} from "@sentinelauth/types";

const TENANT_EMAIL = "dashboard-auth-test@sentineltest.com";
const TENANT_PASSWORD = "SuperSecure!Password123";
let sessionCookie: string;

beforeAll(async () => {
  // Register tenant
  await app.fetch(
    new Request("http://localhost/tenants/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Dashboard Test Corp",
        adminEmail: TENANT_EMAIL,
        password: TENANT_PASSWORD,
      }),
    })
  );

  // Force verify tenant directly in DB
  await adminDb
    .update(tenants)
    .set({
      isVerified: true,
      settings: { riskThreshold: 0.7, failOpen: true },
    })
    .where(eq(tenants.adminEmail, TENANT_EMAIL));
});

afterAll(async () => {
  await cleanupTenants([TENANT_EMAIL]);
});

describe("POST /dashboard/login", () => {
  it("logs in with valid credentials and sets cookie", async () => {
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

    const body = (await res.json()) as ApiSuccessResponse<TenantLoginResponse>;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.tenantName).toBe("Dashboard Test Corp");

    // Cookie should be set
    const cookieHeader = res.headers.get("set-cookie");
    expect(cookieHeader).toBeTruthy();
    expect(cookieHeader).toContain("dashboard_session=");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("SameSite=Strict");

    // Extract cookie for subsequent tests
    sessionCookie = cookieHeader!.split(";")[0];
  });

  it("rejects wrong password with 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: TENANT_EMAIL,
          password: "WrongPassword!123",
        }),
      })
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  it("rejects unknown email with same 401 — no enumeration", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: "ghost@sentineltest.com",
          password: TENANT_PASSWORD,
        }),
      })
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  it("rejects invalid email format with 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: "not-an-email",
          password: TENANT_PASSWORD,
        }),
      })
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /dashboard/me", () => {
  it("returns tenant info with valid session cookie", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/me", {
        headers: { Cookie: sessionCookie },
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<DashboardMeResponse>;
    console.log("Full response body:", JSON.stringify(body));
    expect(res.status).toBe(200);
    expect(body.data.tenantId).toBeTruthy();
    expect(body.data.tenantName).toBe("Dashboard Test Corp");
    expect(body.data.settings.riskThreshold).toBe(0.7);
    expect(body.data.settings.failOpen).toBe(true);
  });

  it("rejects request with no cookie", async () => {
    const res = await app.fetch(new Request("http://localhost/dashboard/me"));

    expect(res.status).toBe(401);
  });

  it("rejects request with invalid cookie value", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/me", {
        headers: { Cookie: "dashboard_session=invalidtoken" },
      })
    );

    expect(res.status).toBe(401);
  });
});

describe("POST /dashboard/logout", () => {
  it("logs out and clears cookie", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/logout", {
        method: "POST",
        headers: { Cookie: sessionCookie },
      })
    );

    expect(res.status).toBe(200);

    // Cookie should be cleared
    const cookieHeader = res.headers.get("set-cookie");
    expect(cookieHeader).toBeTruthy();
    expect(cookieHeader).toContain("dashboard_session=;");
  });

  it("session is invalid after logout", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/me", {
        headers: { Cookie: sessionCookie },
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects logout without session cookie", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/logout", {
        method: "POST",
      })
    );

    expect(res.status).toBe(401);
  });
});
