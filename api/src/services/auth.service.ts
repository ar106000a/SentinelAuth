import { and, eq } from "drizzle-orm";
import { adminDb } from "../db";
import { tenants } from "../db/schema";
import {
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
} from "../utils/error";
import { withTenant } from "../db/with-tenant";
import { PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema/index";
import { sha256, verifyPassword } from "../utils/crypto";
import {
  hashToken,
  signJwt,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";
import { env } from "../config/env";
import { randomBytes } from "crypto";

export interface LoginInput {
  tenantId: string;
  email: string;
  password: string;
}
export interface LoginOutput {
  accessToken?: string;
  refreshToken?: string;
  mfaRequired: false;
  sessionChallenge?: string;
  userId: string;
}

export async function loginUser(input: LoginInput): Promise<LoginOutput> {
  const { tenantId, email, password } = input;

  let mfaRequired = false;
  let sessionChallengeOut: string | undefined;
  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let userId: string;

  //checking if the tenant exists or not
  const [tenant] = await adminDb
    .select({
      privateKeyEncrypted: tenants.privateKeyEncrypted,
      settings: tenants.settings,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant || !tenant.privateKeyEncrypted) {
    throw new NotFoundError("Tenant");
  }

  await withTenant(tenantId, async (client: PoolClient) => {
    const tenantDb = drizzle(client, { schema });

    const [user] = await tenantDb
      .select()
      .from(schema.users)
      .where(
        and(eq(schema.users.email, email), eq(schema.users.tenantId, tenantId))
      )
      .limit(1);

    if (!user) {
      throw new AuthenticationError("Invalid Email or password.");
    }
    if (!user.isVerified) {
      throw new ForbiddenError(
        "Email not verified. Check your inbox for a verification code."
      );
    }
    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      throw new AuthenticationError("Invalid email or password.");
    }

    if (user.mfaEnabled) {
      //Creating session challenge - random token not a jwt
      const sessionChallenge = randomBytes(32).toString("hex");
      const challengeHash = sha256(sessionChallenge);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await tenantDb.insert(schema.otpTokens).values({
        tenantId,
        userId: user.id,
        tokenHash: challengeHash,
        type: "mfa_challenge",
        expiresAt,
      });

      await tenantDb.insert(schema.riskLogs).values({
        tenantId,
        userId: user.id,
        eventType: "mfa_triggered",
        mfaTriggered: true,
      });

      mfaRequired = true;
      sessionChallengeOut = sessionChallenge;
      userId = user.id;

      return;
    }

    accessToken = signJwt(
      {
        sub: user.id,
        tenantId,
        email: user.email,
        isVerified: user.isVerified,
      },
      tenant.privateKeyEncrypted
    );

    const tokenHash = hashToken(accessToken);
    const expiresAt = new Date(Date.now() + parseExpiry(env.JWT_ACCESS_EXPIRY));

    const [session] = await tenantDb
      .insert(schema.sessions)
      .values({
        tenantId,
        userId: user.id,
        tokenHash,
        isRevoked: false,
        expiresAt,
      })
      .returning({ id: schema.sessions.id });

    refreshToken = signRefreshToken({
      sub: user.id,
      tenantId,
      sessionId: session.id,
    });

    await tenantDb
      .update(schema.users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));

    userId = user.id;
    // console.log("Refresh token here in the response body: ", refreshToken);
    // Log successful login
    await tenantDb.insert(schema.riskLogs).values({
      tenantId,
      userId: user.id,
      eventType: "login_success",
      riskScore: null, // Phase 3 will populate this
      mfaTriggered: false, // Phase 3 will set this dynamically
      ipAddress: null, // Phase 3 will wire this in
      userAgent: null, // Phase 3 will wire this in
      fingerprint: null, // Phase 3 will wire this in
    });
  });
  return {
    accessToken: accessToken!,
    refreshToken: refreshToken!,
    mfaRequired,
    sessionChallenge:sessionChallengeOut,
    userId: userId!,
  };
}

function parseExpiry(expiry: string): number {
  const unit = expiry.slice(-1);
  const value = parseInt(expiry.slice(0, -1));

  switch (unit) {
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 15 * 60 * 1000; // default 15 min
  }
}

export async function logoutUser(
  tenantId: string,
  userId: string,
  token: string
): Promise<void> {
  const tokenHash = hashToken(token);

  await withTenant(tenantId, async (client: PoolClient) => {
    const tenantDb = drizzle(client, { schema });

    await tenantDb
      .update(schema.sessions)
      .set({ isRevoked: true })
      .where(
        and(
          eq(schema.sessions.tokenHash, tokenHash),
          eq(schema.sessions.tenantId, tenantId),
          eq(schema.sessions.userId, userId)
        )
      );
  });
}
export interface RefreshOutput {
  accessToken: string;
}

export async function refreshAccessToken(
  tenantId: string,
  refreshToken: string
): Promise<RefreshOutput> {
  const payload = verifyRefreshToken(refreshToken);
  if (payload.tenantId !== tenantId) {
    throw new AuthenticationError("Token tenant mismatch");
  }

  const [tenant] = await adminDb
    .select({ privateKeyEncrypted: tenants.privateKeyEncrypted })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant?.privateKeyEncrypted) {
    throw new AuthenticationError("Tenant configuration error");
  }
  let accessToken: string;
  await withTenant(tenantId, async (client: PoolClient) => {
    const tenantDb = drizzle(client, { schema });

    const [session] = await tenantDb
      .select()
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.tenantId, tenantId),
          eq(schema.sessions.userId, payload.sub),
          eq(schema.sessions.id, payload.sessionId)
        )
      )
      .limit(1);

    if (!session || session.isRevoked) {
      throw new AuthenticationError("Session is invalid or has been revoked");
    }

    const [user] = await tenantDb
      .select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.id, payload.sub),
          eq(schema.users.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!user) {
      throw new AuthenticationError("User not found");
    }

    accessToken = signJwt(
      {
        sub: user.id,
        tenantId: user.tenantId,
        email: user.email,
        isVerified: user.isVerified,
      },
      tenant.privateKeyEncrypted
    );

    const newTokenHash = hashToken(accessToken);
    const newExpiresAt = new Date(
      Date.now() + parseExpiry(env.JWT_ACCESS_EXPIRY)
    );

    await tenantDb
      .update(schema.sessions)
      .set({
        tokenHash: newTokenHash,
        expiresAt: newExpiresAt,
      })
      .where(
        and(
          eq(schema.sessions.id, session.id),
          eq(schema.sessions.tenantId, tenantId)
        )
      );
    // console.log("✅ Updated tokenHash to:", newTokenHash);
    // console.log("✅ For sessionId:", session.id);
  });
  return { accessToken: accessToken! };
}

export async function logFailedLogin(
  tenantId: string,
  userId?: string
): Promise<void> {
  await adminDb.insert(schema.riskLogs).values({
    tenantId,
    userId: userId ?? null,
    eventType: "login_failed",
    riskScore: null,
    mfaTriggered: false,
    ipAddress: null,
  });
}
