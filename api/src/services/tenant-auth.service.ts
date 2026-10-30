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
import { limit, otpLayer, isRateLimitDisabled } from "../lib/rate-limiter";

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
    throw new AuthenticationError("Invalid email or password."); //generic error: no enumeration
  }

  if (!tenant.isVerified) {
    throw new ForbiddenError(
      "Email not verified. Complete verification before logging in."
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
  // console.log("Tenant from DB:", JSON.stringify(tenant)); // add this for debugging

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
  // Normalize email before any limit check so the key is canonical.
  const normalizedEmail = adminEmail.trim().toLowerCase();

  // ── Layer 1: OTP generation rate limit ──────────────────────────────────
  // Scope is the fixed label "tenant-admin" because /tenants/* has no tenantId.
  // Apply limit BEFORE DB lookup — consistent timing regardless of whether
  // the email exists, preventing account enumeration via response time.
  if (!isRateLimitDisabled()) {
    const scope = "tenant-admin";
    const otpLimitResult = await limit([
      otpLayer("otp-gen-min:password-reset", scope, normalizedEmail, 1, 1 / 60),
      otpLayer("otp-gen-hour:password-reset", scope, normalizedEmail, 5, 5 / 3600),
      otpLayer("otp-gen-day:password-reset", scope, normalizedEmail, 10, 10 / 86400),
    ]);

    if (!otpLimitResult.allowed) {
      // Log throttle event, then return the same generic success — no enumeration.
      console.warn(
        JSON.stringify({
          signal: "otp_generation_throttled",
          scope,
          eventType: "password_reset",
          // Do NOT log the email — it is PII
        })
      );
      return; // identical response as the success path
    }
  }

  //Retrieving the tenant from db
  const [tenant] = await adminDb
    .select({ id: tenants.id, isVerified: tenants.isVerified })
    .from(tenants)
    .where(eq(tenants.adminEmail, normalizedEmail))
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

  await sendOtpEmail(normalizedEmail, rawOtp, "password_reset");
  return;
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

  await adminDb.insert(riskLogs).values({
    tenantId: tenant.id,
    userId: null,
    eventType: "tenant_password_reset",
    mfaTriggered: false,
    ipAddress: ipAddress ?? null, // wire in from route later
  });

  if (!tenant || !tenant.isVerified) {
    throw new AuthenticationError("Invalid or expired reset code"); //😉
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

  
}
