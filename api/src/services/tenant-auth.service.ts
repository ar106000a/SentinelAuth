import { and, eq, sql } from "drizzle-orm";
import { adminDb } from "../db";
import { otpTokens, riskLogs, tenants, tenantSessions } from "../db/schema";
import {
  AuthenticationError,
  ForbiddenError,
  ValidationError,
} from "../utils/error";
import {
  generateOtp,
  hashPassword,
  sha256,
  verifyPassword,
} from "../utils/crypto";
import { randomBytes } from "crypto";
import { sendOtpEmail } from "./email.service";
import { isPasswordPwned } from "./hibp.service";

export interface TenantLoginInput {
  adminEmail: string;
  password: string;
}

export interface TenantloginOutput {
  rawToken: string;
  tenantId: string;
  tenantName: string;
}

export async function loginTenant(
  input: TenantLoginInput
): Promise<TenantloginOutput> {
  const { adminEmail, password } = input;

  //finding tenant by email
  const [tenant] = await adminDb
    .select({
      id: tenants.id,
      name: tenants.name,
      passwordHash: tenants.passwordHash,
      isVerified: tenants.isVerified,
    })
    .from(tenants)
    .where(eq(tenants.adminEmail, adminEmail))
    .limit(1);

  if (!tenant) {
    throw new AuthenticationError("Invalid email or password"); //generic error: no enumeration
  }

  if (!tenant.isVerified) {
    throw new ForbiddenError(
      "Email not verified. Complete verification before logggin in"
    );
  }

  const valid = await verifyPassword(tenant.passwordHash, password);
  if (!valid) {
    throw new AuthenticationError("Invalid email or password"); //again generic error
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await adminDb.insert(tenantSessions).values({
    tenantId: tenant.id,
    tokenHash,
    expiresAt,
  });

  return {
    rawToken,
    tenantId: tenant.id,
    tenantName: tenant.name,
  };
}

export async function logoutTenant(rawToken: string): Promise<void> {
  const tokenHash = sha256(rawToken);
  await adminDb
    .delete(tenantSessions)
    .where(eq(tenantSessions.tokenHash, tokenHash));
}
export interface SessionValidationResult {
  tenantId: string;
  tenantName: string;
  settings: {
    riskThreshold: number;
    failOpen: boolean;
  };
}

export async function validateDashboardSession(
  rawToken: string
): Promise<SessionValidationResult> {
  const tokenHash = sha256(rawToken);
  const [session] = await adminDb
    .select({
      id: tenantSessions.id,
      tenantId: tenantSessions.tenantId,
      expiresAt: tenantSessions.expiresAt,
    })
    .from(tenantSessions)
    .where(eq(tenantSessions.tokenHash, tokenHash))
    .limit(1);

  if (!session) {
    throw new AuthenticationError("Invalid or expired session");
  }

  if (new Date() > session.expiresAt) {
    await adminDb
      .delete(tenantSessions)
      .where(eq(tenantSessions.id, session.id));
    throw new AuthenticationError("Session has expired.");
  }

  //fetching tenant details
  const [tenant] = await adminDb
    .select({
      name: tenants.name,
      settings: tenants.settings,
      isVerified: tenants.isVerified,
    })
    .from(tenants)
    .where(eq(tenants.id, session.tenantId))
    .limit(1);
  console.log("Tenant from DB:", JSON.stringify(tenant)); // add this for debugging

  if (!tenant) {
    throw new AuthenticationError("Tenant not found");
  }

  return {
    tenantId: session.tenantId,
    tenantName: tenant.name,
    settings: tenant.settings as { riskThreshold: number; failOpen: boolean },
  };
}

export async function tenantForgotPassword(adminEmail: string): Promise<void> {
  const [tenant] = await adminDb
    .select({ id: tenants.id, isVerified: tenants.isVerified })
    .from(tenants)
    .where(eq(tenants.adminEmail, adminEmail))
    .limit(1);

  if (!tenant || !tenant.isVerified) {
    return;
  }
  await adminDb
    .update(otpTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(otpTokens.tenantId, tenant.id),
        eq(otpTokens.type, "password_reset"),
        sql`used_at IS null`
      )
    );

  const { rawOtp, otpHash } = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await adminDb.insert(otpTokens).values({
    tenantId: tenant.id,
    userId: null,
    tokenHash: otpHash,
    type: "password_reset",
    expiresAt,
  });

  await sendOtpEmail(adminEmail, rawOtp, "password_reset");
}
export interface TenantResetPasswordInput {
  adminEmail: string;
  otp: string;
  newPassword: string;
}

export async function tenantResetPassword(
  input: TenantResetPasswordInput,
  ipAddress?: string
): Promise<void> {
  const { adminEmail, otp, newPassword } = input;
  const [tenant] = await adminDb
    .select({ id: tenants.id, isVerified: tenants.isVerified })
    .from(tenants)
    .where(eq(tenants.adminEmail, adminEmail))
    .limit(1);

  if (!tenant || !tenant.isVerified) {
    throw new AuthenticationError("Expired or invalid reset code"); //😉
  }

  const [token] = await adminDb
    .select()
    .from(otpTokens)
    .where(
      and(
        eq(otpTokens.tenantId, tenant.id),
        eq(otpTokens.type, "password_reset"),
        sql`used_at IS NULL`,
        sql`expires_at > NOW()`
      )
    )
    .limit(1);

  if (!token) {
    throw new AuthenticationError("Invalid or expired reset code");
  }

  const otpHash = sha256(otp);
  if (token.tokenHash !== otpHash) {
    throw new AuthenticationError("Invalid or expired reset code");
  }
  // 4. HIBP check on new password
  const isPwned = await isPasswordPwned(newPassword);
  if (isPwned) {
    throw new ValidationError(
      "This password has appeared in a known data breach. Please choose a different password."
    );
  }

  // 5. Hash new password
  const passwordHash = await hashPassword(newPassword);

  // 6. Mark token used
  await adminDb
    .update(otpTokens)
    .set({ usedAt: new Date() })
    .where(eq(otpTokens.id, token.id));

  // 7. Update password
  await adminDb
    .update(tenants)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(tenants.id, tenant.id));

  // 8. Invalidate all dashboard sessions — password changed
  await adminDb
    .delete(tenantSessions)
    .where(eq(tenantSessions.tenantId, tenant.id));

  await adminDb.insert(riskLogs).values({
    tenantId: tenant.id,
    userId: null,
    eventType: "tenant_password_reset",
    mfaTriggered: false,
    ipAddress: ipAddress ?? null, // wire in from route later
  });
}
