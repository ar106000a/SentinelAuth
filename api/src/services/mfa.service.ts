import * as schema from "../db/index";
import { PoolClient } from "pg";
import { withTenant } from "../db/with-tenant";
import { drizzle } from "drizzle-orm/node-postgres";
import { otpTokens, riskLogs, sessions, tenants, users } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import {
  AuthenticationError,
  NotFoundError,
  ValidationError,
} from "../utils/error";
import {
  decryptMfaSecret,
  encryptMfaSecret,
  sha256,
  verifyPassword,
} from "../utils/crypto";
import { hashToken, signJwt, signRefreshToken } from "../utils/jwt";
import { env } from "../config/env";
export interface MfaSetupOutput {
  secret: string;
  qrCodeDataUri: string;
}

export async function setupMfa(
  userId: string,
  tenantId: string,
  tenantName: string,
  userEmail: string
): Promise<MfaSetupOutput> {
  await withTenant(tenantId, async (client: PoolClient) => {
    const tenantDb = drizzle(client, { schema });

    //get user
    const [user] = await tenantDb
      .select({ mfaEnabled: users.mfaEnabled })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .limit(1);

    if (!user) {
      throw new NotFoundError("User");
    }
    if (user.mfaEnabled) {
      throw new ValidationError("MFA is already Enabled!");
    }
  });

  const secret = generateSecret();
  const otpPathUri = generateURI({
    label: userEmail,
    issuer: tenantName || "SentinelAuth",
    secret: secret,
  });

  const qrCodeDataUri = await QRCode.toDataURL(otpPathUri);

  await withTenant(tenantId, async (client: PoolClient) => {
    const tenantDb = drizzle(client, { schema });
    await tenantDb
      .update(users)
      .set({ mfaSecret: encryptMfaSecret(secret) })
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
  });

  return { secret, qrCodeDataUri };
}
export async function enableMfa(
  tenantId: string,
  userId: string,
  code: string
): Promise<void> {
  await withTenant(tenantId, async (client: PoolClient) => {
    const tenantDb = drizzle(client, { schema });

    const [user] = await tenantDb
      .select({
        mfaSecret: users.mfaSecret,
        mfaEnabled: users.mfaEnabled,
      })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .limit(1);

    if (!user) {
      throw new NotFoundError("User");
    }
    if (user.mfaEnabled) {
      throw new ValidationError("MFA already enabled!");
    }
    if (!user.mfaSecret) {
      throw new ValidationError(
        "MFA has not been initiated. Call /mfa/setup first."
      );
    }
    const secret = decryptMfaSecret(user.mfaSecret);
    const isValid = (await verify({ token: code, secret })).valid;

    if (!isValid) {
      throw new AuthenticationError("Invalid authentication code");
    }
    await tenantDb
      .update(users)
      .set({ mfaEnabled: true, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));

    await tenantDb.insert(riskLogs).values({
      tenantId,
      userId,
      eventType: "mfa_enabled",
      mfaTriggered: false,
    });
  });
}
export interface DisableMfaInput {
  tenantId: string;
  userId: string;
  password: string;
  code: string;
}
export async function disableMfa(input: DisableMfaInput): Promise<void> {
  const { tenantId, userId, password, code } = input;
  await withTenant(tenantId, async (client: PoolClient) => {
    const tenantDb = drizzle(client, { schema });

    const [user] = await tenantDb
      .select({
        passwordHash: users.passwordHash,
        mfaEnabled: users.mfaEnabled,
        mfaSecret: users.mfaSecret,
      })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
      .limit(1);

    if (!user) {
      throw new NotFoundError("User");
    }
    if (!user.mfaEnabled || !user.mfaSecret) {
      throw new ValidationError("MFA is not enabled.");
    }
    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
      throw new AuthenticationError("Invalid Password!");
    }

    const secret = decryptMfaSecret(user.mfaSecret);
    const isValid = (await verify({ token: code, secret })).valid;

    if (!isValid) {
      throw new AuthenticationError("Invalid authentication code!");
    }
    await tenantDb
      .update(users)
      .set({
        mfaEnabled: false,
        mfaSecret: null,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));

    await tenantDb.insert(riskLogs).values({
      tenantId,
      userId,
      mfaTriggered: false,
      eventType: "mfa_disabled",
    });
  });
}

export async function verifyTotpCode(
  encryptedSecret: string,
  code: string
): Promise<boolean> {
  const secret = decryptMfaSecret(encryptedSecret);
  const isValid = (await verify({ token: code, secret })).valid;
  return isValid;
}

export interface MfaVerifyInput {
  tenantId: string;
  sessionChallenge: string;
  code: string;
}

export interface MfaVerifyOutput {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

export async function verifyMfaChallenge(
  input: MfaVerifyInput
): Promise<MfaVerifyOutput> {
  const { tenantId, sessionChallenge, code } = input;

  const [tenant] = await schema.adminDb
    .select({ privateKeyEncrypted: tenants.privateKeyEncrypted })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant?.privateKeyEncrypted) {
    throw new AuthenticationError("Tenant configuration error.");
  }

  let accessToken!: string;
  let refreshToken!: string;
  let userId!: string;

  await withTenant(tenantId, async (client: PoolClient) => {
    const tenantDb = drizzle(client, { schema });

    const challengeHash = sha256(sessionChallenge);

    const [token] = await tenantDb
      .select()
      .from(otpTokens)
      .where(
        and(
          eq(otpTokens.tenantId, tenantId),
          eq(otpTokens.type, "mfa_challenge"),
          eq(otpTokens.tokenHash, challengeHash)
        )
      )
      .limit(1);

    if (!token) {
      throw new AuthenticationError("Invalid or expired session challenge!");
    }
    if (token.usedAt !== null) {
      throw new AuthenticationError("Session challenge already used!");
    }
    if (new Date() > token.expiresAt) {
      throw new AuthenticationError("Session challenge has expired!");
    }

    const [user] = await tenantDb
      .select()
      .from(users)
      .where(eq(users.id, token.userId!))
      .limit(1);

    if (!user || !user.mfaSecret) {
      throw new AuthenticationError("MFA configuration error");
    }

    const isValid = await verifyTotpCode(user.mfaSecret, code);
    if (!isValid) {
      await schema.adminDb.insert(riskLogs).values({
        tenantId,
        userId: user.id,
        eventType: "mfa_failed",
        mfaTriggered: true,
      });
      throw new AuthenticationError("Invalid authentication code.");
    }

    //Marking challenge as used
    await tenantDb
      .update(otpTokens)
      .set({ usedAt: new Date() })
      .where(eq(otpTokens.id, token.id));

    //Issuing tokens
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
    const expiresAt = new Date(
      Date.now() + parseExpiryMs(env.JWT_ACCESS_EXPIRY)
    );
    const [session] = await tenantDb
      .insert(sessions)
      .values({
        tenantId,
        userId: user.id,
        tokenHash,
        isRevoked: false,
        expiresAt,
      })
      .returning({ id: sessions.id });

    refreshToken = signRefreshToken({
      sub: user.id,
      tenantId,
      sessionId: session.id,
    });

    await tenantDb
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await tenantDb.insert(riskLogs).values({
      tenantId,
      userId: user.id,
      eventType: "mfa_success",
      mfaTriggered: true,
    });

    userId = user.id;
  });

  return { accessToken, refreshToken, userId };
}
// Helper — duplicated from auth.service.ts for now
function parseExpiryMs(expiry: string): number {
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
      return 15 * 60 * 1000;
  }
}
