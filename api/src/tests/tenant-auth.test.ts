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
  it("allows request with valid verified API key", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/ping", {
        headers: {
          Authorization: `Bearer ${verifiedSecret}`,
        },
      })
    );

    const body = (await res.json()) as {
      success: boolean;
      data: { tenantId: string; tenantName: string };
    };

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.tenantId).toBeTruthy();
    expect(body.data.tenantName).toBeTruthy();
  });

  it("rejects request with no Authorization header", async () => {
    const res = await app.fetch(new Request("http://localhost/api/ping"));

    const body = (await res.json()) as {
      success: boolean;
      error: { code: string };
    };

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  it("rejects request with malformed Authorization header", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/ping", {
        headers: { Authorization: "NotBearer abc123" },
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects request with invalid API key", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/ping", {
        headers: { Authorization: "Bearer invalidkeyvalue" },
      })
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("AUTHENTICATION_ERROR");
  });

  it("rejects unverified tenant with 403", async () => {
    try {
      // Get the unverified tenant's raw secret from seed
      const { rawSecret: unverifiedSecret } = await seedTenant({
        adminEmail: "auth-middleware-unverified-2@sentineltest.com",
        isVerified: false,
      });

      const res = await app.fetch(
        new Request("http://localhost/api/ping", {
          headers: { Authorization: `Bearer ${unverifiedSecret}` },
        })
      );

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("FORBIDDEN");
    } finally {
      // Cleanup extra tenant
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

  it("attaches tenantId to context correctly", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/ping", {
        headers: { Authorization: `Bearer ${verifiedSecret}` },
      })
    );

    const body = (await res.json()) as {
      data: { tenantId: string };
    };
    console.log(body.data);
    // tenantId should be a valid UUID format
    expect(body.data.tenantId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});
