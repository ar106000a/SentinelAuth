import * as schema from "../db/index";
import { PoolClient } from "pg";
import { withTenant } from "../db/with-tenant";
import { drizzle } from "drizzle-orm/node-postgres";
import { riskLogs, users } from "../db/schema";
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
  verifyPassword,
} from "../utils/crypto";

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
