import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../index.js";
// import { adminDb } from "../db/index.js";
// import { tenants } from "../db/schema/index.js";
// import { inArray } from "drizzle-orm";
import { seedTenant, cleanupTenants } from "./utils/seed.js";

const TEST_EMAILS = [
  "auth-middleware-verified@sentineltest.com",
  "auth-middleware-unverified@sentineltest.com",
];

let verifiedSecret: string;

beforeAll(async () => {
  // Seed a verified tenant
  const { rawSecret } = await seedTenant({
    adminEmail: TEST_EMAILS[0],
    isVerified: true,
  });
  verifiedSecret = rawSecret;

  // Seed an unverified tenant
  await seedTenant({
    adminEmail: TEST_EMAILS[1],
    isVerified: false,
  });
});

afterAll(async () => {
  await cleanupTenants(TEST_EMAILS);
});

describe("tenantContext middleware", () => {
  it("allows request with valid verified API key on the public ping route", async () => {
    const res = await app.fetch(
      new Request("http://localhost/ping", {
        headers: {
          Authorization: `Bearer ${verifiedSecret}`,
        },
      })
    );

    const body = (await res.json()) as {
      success: boolean;
      data?: { tenantId?: string; tenantName?: string };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("allows request with no Authorization header", async () => {
    const res = await app.fetch(new Request("http://localhost/ping"));

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data?: { tenantId?: string; tenantName?: string };
    };
    expect(body.success).toBe(true);
  });

  it("allows request with malformed Authorization header", async () => {
    const res = await app.fetch(
      new Request("http://localhost/ping", {
        headers: { Authorization: "NotBearer abc123" },
      })
    );

    expect(res.status).toBe(200);
  });

  it("allows request with invalid API key", async () => {
    const res = await app.fetch(
      new Request("http://localhost/ping", {
        headers: { Authorization: "Bearer invalidkeyvalue" },
      })
    );

    expect(res.status).toBe(200);
  });

  it("allows unverified tenant through the public ping route", async () => {
    try {
      const { rawSecret: unverifiedSecret } = await seedTenant({
        adminEmail: "auth-middleware-unverified-2@sentineltest.com",
        isVerified: false,
      });

      const res = await app.fetch(
        new Request("http://localhost/ping", {
          headers: { Authorization: `Bearer ${unverifiedSecret}` },
        })
      );

      expect(res.status).toBe(200);
    } finally {
      await cleanupTenants(["auth-middleware-unverified-2@sentineltest.com"]);
    }
  });

  it("does not require auth on /health", async () => {
    const res = await app.fetch(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
  });

  it("does not require auth on /tenants/register", async () => {
    try {
      const res = await app.fetch(
        new Request("http://localhost/tenants/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Public Route Test",
            adminEmail: "public-route-test@sentineltest.com",
            password: "SuperSecure!Password123",
          }),
        })
      );

      // 201 or 409 both mean the route was reached without auth
      expect([201, 409]).toContain(res.status);
    } finally {
      await cleanupTenants(["public-route-test@sentineltest.com"]);
    }
  });

  it("does not require tenant context on the public ping route", async () => {
    const res = await app.fetch(
      new Request("http://localhost/ping", {
        headers: { Authorization: `Bearer ${verifiedSecret}` },
      })
    );

    const body = (await res.json()) as {
      data?: { tenantId?: string; tenantName?: string };
    };

    expect(res.status).toBe(200);
    expect(body.data?.tenantId).toBeUndefined();
    expect(body.data?.tenantName).toBeUndefined();
  });
});
