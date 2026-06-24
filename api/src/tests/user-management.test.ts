import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import {
  tenants,
  users,
  riskLogs,
  sessions,
  //   otpTokens,
} from "../db/schema/index.js";
import { eq, and } from "drizzle-orm";
import { cleanupTenants, seedTenant } from "./utils/seed.js";
import {
  generateRSAKeyPair,
  generateSecretKey,
  encryptPrivateKey,
  //   generateOtp,
} from "../utils/crypto.js";
import { hashToken } from "../utils/jwt.js";
import type {
  UserListPage,
  GdprDeleteResult,
  ApiSuccessResponse,
} from "@sentinelauth/types";

vi.mock("../services/email.service.js", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
}));

const TENANT_EMAIL = "user-mgmt-test@sentineltest.com";
const TENANT_PASSWORD = "SuperSecure!Password123";
let sessionCookie: string;
let tenantId: string;
let tenantSecret: string;

beforeAll(async () => {
  // Register tenant
  await app.fetch(
    new Request("http://localhost/tenants/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "User Mgmt Corp",
        adminEmail: TENANT_EMAIL,
        password: TENANT_PASSWORD,
      }),
    })
  );

  // Generate and store real keys
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

  // Login to dashboard
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

  // Seed some users
  await adminDb.insert(users).values([
    {
      tenantId,
      email: "alice@example.com",
      passwordHash: "hash",
      isVerified: true,
    },
    {
      tenantId,
      email: "bob@example.com",
      passwordHash: "hash",
      isVerified: false,
    },
    {
      tenantId,
      email: "charlie@example.com",
      passwordHash: "hash",
      isVerified: true,
    },
  ]);
});

afterAll(async () => {
  await cleanupTenants([TENANT_EMAIL]);
});

function sessionHeaders() {
  return { Cookie: sessionCookie };
}

describe("GET /dashboard/users", () => {
  it("returns paginated user list", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/users", {
        headers: sessionHeaders(),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<UserListPage>;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.entries)).toBe(true);
    expect(body.data.entries.length).toBeGreaterThan(0);
    expect(body.data.total).toBeGreaterThan(0);
  });

  it("filters users by search term", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/users?search=alice", {
        headers: sessionHeaders(),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<UserListPage>;

    expect(res.status).toBe(200);
    body.data.entries.forEach((entry) => {
      expect(entry.email.toLowerCase()).toContain("alice");
    });
  });

  it("search is case insensitive", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/users?search=ALICE", {
        headers: sessionHeaders(),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<UserListPage>;

    expect(res.status).toBe(200);
    expect(body.data.entries.length).toBeGreaterThan(0);
  });

  it("respects pagination params", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/users?page=1&limit=2", {
        headers: sessionHeaders(),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<UserListPage>;

    expect(res.status).toBe(200);
    expect(body.data.entries.length).toBeLessThanOrEqual(2);
    expect(body.data.limit).toBe(2);
  });

  it("does not expose passwordHash in response", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/users", {
        headers: sessionHeaders(),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<UserListPage>;
    const entry = body.data.entries[0] as unknown as Record<string, unknown>;

    expect(entry.passwordHash).toBeUndefined();
    expect(entry.mfaSecret).toBeUndefined();
  });

  it("rejects unauthenticated request with 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/users")
    );

    expect(res.status).toBe(401);
  });
});

describe("DELETE /dashboard/users/:id", () => {
  it("deletes user and nullifies risk log entries", async () => {
    // Get alice's ID
    const [alice] = await adminDb
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.tenantId, tenantId), eq(users.email, "alice@example.com"))
      );

    // Seed a risk log for alice
    await adminDb.insert(riskLogs).values({
      tenantId,
      userId: alice.id,
      eventType: "login_success",
      mfaTriggered: false,
    });

    // Delete alice
    const res = await app.fetch(
      new Request(`http://localhost/dashboard/users/${alice.id}`, {
        method: "DELETE",
        headers: sessionHeaders(),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<GdprDeleteResult>;

    expect(res.status).toBe(200);
    expect(body.data.userId).toBe(alice.id);
    expect(body.data.message).toContain("GDPR");

    // User should be gone
    const [deleted] = await adminDb
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, alice.id));

    expect(deleted).toBeUndefined();

    // Risk logs should have userId nullified
    const logs = await adminDb
      .select()
      .from(riskLogs)
      .where(eq(riskLogs.tenantId, tenantId));

    const aliceLogs = logs.filter((l) => l.userId === alice.id);
    expect(aliceLogs).toHaveLength(0);
  });

  it("revokes active sessions on delete", async () => {
    const [bob] = await adminDb
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.tenantId, tenantId), eq(users.email, "bob@example.com"))
      );

    // Seed an active session for bob
    await adminDb.insert(sessions).values({
      tenantId,
      userId: bob.id,
      tokenHash: hashToken("bob-fake-token"),
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await app.fetch(
      new Request(`http://localhost/dashboard/users/${bob.id}`, {
        method: "DELETE",
        headers: sessionHeaders(),
      })
    );

    // Bob's user is deleted — sessions cascade deleted too
    const bobSessions = await adminDb
      .select()
      .from(sessions)
      .where(eq(sessions.userId, bob.id));

    expect(bobSessions).toHaveLength(0);
  });

  it("returns 404 for non-existent user", async () => {
    const res = await app.fetch(
      new Request(
        "http://localhost/dashboard/users/00000000-0000-0000-0000-000000000000",
        {
          method: "DELETE",
          headers: sessionHeaders(),
        }
      )
    );

    expect(res.status).toBe(404);
  });

  it("cannot delete user belonging to another tenant", async () => {
    try {
      // Seed a user in a different tenant
      const { tenant: otherTenant } = await seedTenant({
        adminEmail: "other-tenant-user-mgmt@sentineltest.com",
        isVerified: true,
      });

      const [otherUser] = await adminDb
        .insert(users)
        .values({
          tenantId: otherTenant.id,
          email: "other-user@example.com",
          passwordHash: "hash",
          isVerified: true,
        })
        .returning({ id: users.id });

      // Try to delete other tenant's user using our session
      const res = await app.fetch(
        new Request(`http://localhost/dashboard/users/${otherUser.id}`, {
          method: "DELETE",
          headers: sessionHeaders(),
        })
      );

      // Should 404 — user not found in our tenant
      expect(res.status).toBe(404);
    } finally {
      await cleanupTenants(["other-tenant-user-mgmt@sentineltest.com"]);
    }
  });

  it("rejects unauthenticated request with 401", async () => {
    const res = await app.fetch(
      new Request(
        "http://localhost/dashboard/users/00000000-0000-0000-0000-000000000000",
        { method: "DELETE" }
      )
    );

    expect(res.status).toBe(401);
  });
});
