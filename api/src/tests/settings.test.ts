import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { tenants } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { cleanupTenants } from "./utils/seed.js";
import type { TenantSettings, ApiSuccessResponse } from "@sentinelauth/types";

const TENANT_EMAIL = "settings-test@sentineltest.com";
const TENANT_PASSWORD = "SuperSecure!Password123";
let sessionCookie: string;

beforeAll(async () => {
  // Register tenant
  await app.fetch(
    new Request("http://localhost/tenants/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Settings Test Corp",
        adminEmail: TENANT_EMAIL,
        password: TENANT_PASSWORD,
      }),
    })
  );

  // Force verify + set settings
  await adminDb
    .update(tenants)
    .set({
      isVerified: true,
      settings: { riskThreshold: 0.7, failOpen: true },
    })
    .where(eq(tenants.adminEmail, TENANT_EMAIL));

  // Login to get session cookie
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

  const cookieHeader = res.headers.get("set-cookie")!;
  sessionCookie = cookieHeader.split(";")[0];
});

afterAll(async () => {
  await cleanupTenants([TENANT_EMAIL]);
});

function sessionHeaders() {
  return { Cookie: sessionCookie };
}

describe("GET /dashboard/settings", () => {
  it("returns current settings", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/settings", {
        headers: sessionHeaders(),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<TenantSettings>;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.riskThreshold).toBe(0.7);
    expect(body.data.failOpen).toBe(true);
  });

  it("rejects unauthenticated request with 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/settings")
    );

    expect(res.status).toBe(401);
  });
});

describe("PUT /dashboard/settings", () => {
  it("updates riskThreshold only", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders(),
        },
        body: JSON.stringify({ riskThreshold: 0.5 }),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<TenantSettings>;

    expect(res.status).toBe(200);
    expect(body.data.riskThreshold).toBe(0.5);
    // failOpen should be preserved
    expect(body.data.failOpen).toBe(true);
  });

  it("updates failOpen only", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders(),
        },
        body: JSON.stringify({ failOpen: false }),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<TenantSettings>;

    expect(res.status).toBe(200);
    expect(body.data.failOpen).toBe(false);
    // riskThreshold should be preserved from previous update
    expect(body.data.riskThreshold).toBe(0.5);
  });

  it("updates both fields simultaneously", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders(),
        },
        body: JSON.stringify({ riskThreshold: 0.9, failOpen: true }),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<TenantSettings>;

    expect(res.status).toBe(200);
    expect(body.data.riskThreshold).toBe(0.9);
    expect(body.data.failOpen).toBe(true);
  });

  it("rejects riskThreshold above 1.0", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders(),
        },
        body: JSON.stringify({ riskThreshold: 1.5 }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("rejects riskThreshold below 0.0", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders(),
        },
        body: JSON.stringify({ riskThreshold: -0.1 }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("rejects empty body with 400", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders(),
        },
        body: JSON.stringify({}),
      })
    );

    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated request with 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riskThreshold: 0.5 }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("riskThreshold boundary — exactly 0.0 is valid", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders(),
        },
        body: JSON.stringify({ riskThreshold: 0.0 }),
      })
    );

    expect(res.status).toBe(200);
  });

  it("riskThreshold boundary — exactly 1.0 is valid", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...sessionHeaders(),
        },
        body: JSON.stringify({ riskThreshold: 1.0 }),
      })
    );

    expect(res.status).toBe(200);
  });
});
