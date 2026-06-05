import { describe, it, expect, beforeAll, afterAll } from "vitest";
import app from "../index.js";
import { adminDb } from "../db/index.js";
import { tenants, sessions, riskLogs } from "../db/schema/index.js";
import { eq } from "drizzle-orm";
import { cleanupTenants, seedUser } from "./utils/seed.js";
import { hashToken } from "../utils/jwt.js";
import type {
  KeyRotationResponse,
  ApiSuccessResponse,
} from "@sentinelauth/types";
import {
  encryptPrivateKey,
  generateRSAKeyPair,
  generateSecretKey,
} from "../utils/crypto.js";

const TENANT_EMAIL = "key-rotation-test@sentineltest.com";
const TENANT_PASSWORD = "SuperSecure!Password123";
let sessionCookie: string;
let tenantId: string;
let initialPublicKey: string;
let initialSecretKey: string;

beforeAll(async () => {
  // Register
  await app.fetch(
    new Request("http://localhost/tenants/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Key Rotation Corp",
        adminEmail: TENANT_EMAIL,
        password: TENANT_PASSWORD,
      }),
    })
  );

  // Force verify + set keys
  const { rawSecret, secretKeyHash } = generateSecretKey();
  initialSecretKey = rawSecret;

  const { publicKey, privateKey } = generateRSAKeyPair();
  initialPublicKey = publicKey;
  const privateKeyEncrypted = encryptPrivateKey(privateKey);

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

  // Login to get dashboard session
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

describe("POST /dashboard/keys/rotate", () => {
  it("rotates keys and returns new credentials", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/keys/rotate", {
        method: "POST",
        headers: sessionHeaders(),
      })
    );

    const body = (await res.json()) as ApiSuccessResponse<KeyRotationResponse>;

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.publicKey).toContain("BEGIN PUBLIC KEY");
    expect(body.data.secretKey).toHaveLength(64);
    expect(body.data.message).toContain("rotated successfully");

    // New public key must differ from original
    expect(body.data.publicKey).not.toBe(initialPublicKey);
  });

  it("old secret key no longer authenticates API calls", async () => {
    // Try using the old secret key on a protected endpoint
    const res = await app.fetch(
      new Request("http://localhost/api/ping", {
        headers: {
          Authorization: `Bearer ${initialSecretKey}`,
        },
      })
    );

    expect(res.status).toBe(401);
  });

  it("logs key_rotated event to risk_logs", async () => {
    const logs = await adminDb
      .select()
      .from(riskLogs)
      .where(eq(riskLogs.tenantId, tenantId));

    const rotationLog = logs.find((l) => l.eventType === "key_rotated");

    expect(rotationLog).toBeTruthy();
    expect(rotationLog?.userId).toBeNull();
    expect(rotationLog?.mfaTriggered).toBe(false);
  });

  it("revokes all active user sessions after rotation", async () => {
    // Seed a user and create an active session
    const user = await seedUser(tenantId);

    await adminDb.insert(sessions).values({
      tenantId,
      userId: user.id,
      tokenHash: hashToken("fake-token-for-test"),
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    // Rotate keys
    await app.fetch(
      new Request("http://localhost/dashboard/keys/rotate", {
        method: "POST",
        headers: sessionHeaders(),
      })
    );

    // Check all sessions for this tenant are revoked
    const activeSessions = await adminDb
      .select()
      .from(sessions)
      .where(eq(sessions.tenantId, tenantId));

    const anyActive = activeSessions.some((s) => !s.isRevoked);
    expect(anyActive).toBe(false);
  });

  it("rejects unauthenticated request with 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/dashboard/keys/rotate", {
        method: "POST",
      })
    );

    expect(res.status).toBe(401);
  });

  it("new secret key authenticates successfully after rotation", async () => {
    // Rotate and get new key
    const rotateRes = await app.fetch(
      new Request("http://localhost/dashboard/keys/rotate", {
        method: "POST",
        headers: sessionHeaders(),
      })
    );

    const rotateBody =
      (await rotateRes.json()) as ApiSuccessResponse<KeyRotationResponse>;
    const newSecretKey = rotateBody.data.secretKey;

    // New key should work on protected endpoint
    const res = await app.fetch(
      new Request("http://localhost/api/ping", {
        headers: {
          Authorization: `Bearer ${newSecretKey}`,
        },
      })
    );

    expect(res.status).toBe(200);
  });
});
