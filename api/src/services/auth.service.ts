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
import { verifyPassword } from "../utils/crypto";
import { hashToken, signJwt } from "../utils/jwt";
import { env } from "../config/env";

export interface LoginInput {
  tenantId: string;
  email: string;
  password: string;
}
export interface LoginOutput {
  accessToken: string;
  mfaRequired: false;
  userId: string;
}

export async function loginUser(input: LoginInput): Promise<LoginOutput> {
  const { tenantId, email, password } = input;

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

  let accessToken: string;
  let userId: string;

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

    await tenantDb.insert(schema.sessions).values({
      tenantId,
      userId: user.id,
      tokenHash,
      isRevoked: false,
      expiresAt,
    });

    await tenantDb
      .update(schema.users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, user.id));

    userId = user.id;
  });

  return { accessToken: accessToken!, mfaRequired: false, userId: userId! };
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
