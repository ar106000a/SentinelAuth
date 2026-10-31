import { PoolClient } from "pg";
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../utils/error";
import { isPasswordPwned } from "./hibp.service";
import * as schema from "../db/schema/index";
import { drizzle } from "drizzle-orm/node-postgres";
import { withTenant } from "../db/with-tenant";
import { and, eq, isNull, sql } from "drizzle-orm";
import { generateOtp, hashPassword, sha256 } from "../utils/crypto";
import { sendOtpEmail } from "./email.service";
import { adminDb } from "../db";
import { limit, otpLayer, isRateLimitDisabled } from "../lib/rate-limiter";
import {
  chargeAttempt,
  revokeToken,
  consumeToken,
  timingSafeCompare,
  revokeUnusedTokens,
  MAX_ATTEMPTS,
} from "../lib/otp-attempts";

export interface RegisterUserInput {
  tenantId: string;
  email: string;
  password: string;
}

export async function registerUser(
  input: RegisterUserInput
): Promise<{ message: string }> {
  const { tenantId, email, password } = input;

  if (password.length < 8) {
    throw new ValidationError("Password must be at least 8 characters");
  }
  const isPwned = await isPasswordPwned(password);
  if (isPwned) {
    throw new ValidationError(
      "This password has appeared in a known data breach. Please choose a different password."
    );
  }

  await withTenant(tenantId, async (client: PoolClient) => {
    const tenantDb = drizzle(client, { schema });
    const existing = await tenantDb
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(
        and(eq(schema.users.email, email), eq(schema.users.tenantId, tenantId))
      )
      .limit(1);

    if (existing.length > 0) {
      throw new ConflictError("An account with this email already exists");
    }

    const passwordHash = await hashPassword(password);
    const [user] = await tenantDb
      .insert(schema.users)
      .values({ tenantId, email, passwordHash, isVerified: false })
      .returning({ id: schema.users.id });

    const { rawOtp, otpHash } = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await tenantDb.insert(schema.otpTokens).values({
      tenantId,
      userId: user.id,
      tokenHash: otpHash,
      type: "email_verification",
      expiresAt,
    });

    await sendOtpEmail(email, rawOtp, "email_verification");
  });
  return {
    message:
      "Registration successful. Check your email for a verification code.",
  };
}

export interface VerifyUserEmailInput {
  tenantId: string;
  email: string;
  otp: string;
}
export async function verifyUserEmail(
  input: VerifyUserEmailInput
): Promise<{ message: string }> {
  const { tenantId, email, otp } = input;
  await withTenant(tenantId, async (client: PoolClient) => {
    const tenantDb = drizzle(client, { schema });
    const [user] = await tenantDb
      .select()
      .from(schema.users)
      .where(
        and(eq(schema.users.tenantId, tenantId), eq(schema.users.email, email))
      )
      .limit(1);

    if (!user) {
      throw new NotFoundError("User");
    }
    if (user.isVerified) {
      throw new ValidationError("Email is already verified.");
    }

    const [token] = await tenantDb
      .select()
      .from(schema.otpTokens)
      .where(
        and(
          eq(schema.otpTokens.tenantId, user.tenantId),
          eq(schema.otpTokens.userId, user.id),
          eq(schema.otpTokens.type, "email_verification"),
          isNull(schema.otpTokens.usedAt),
          sql`expires_at>NOW()`
        )
      )
      .orderBy(sql`created_at DESC`)
      .limit(1);

    if (!token) {
      throw new AuthenticationError("Invalid or expired verification code.");
    }
    const attempts = await chargeAttempt(token.id);
    if (attempts === null) {
      throw new AuthenticationError("Invalid or expired verification code.");
    }

    const otpHash = sha256(otp);
    const isValid = timingSafeCompare(otpHash, token.tokenHash);

    if (!isValid) {
      if (attempts >= MAX_ATTEMPTS) {
        await revokeToken(token.id);
        throw new ValidationError(
          "Submitted wrong code too many times. Request a new one."
        );
      }

      throw new AuthenticationError("Invalid verification code.");
    }

    const consumed = await consumeToken(token.id);
    if (!consumed) {
      throw new AuthenticationError("Invalid or expired verification code.");
    }

    await tenantDb
      .update(schema.users)
      .set({ isVerified: true, updatedAt: new Date() })
      .where(
        and(eq(schema.users.tenantId, tenantId), eq(schema.users.id, user.id))
      );
  });
  return { message: "Email Verified Successfully, You may now log in." };
}

export async function userForgotPassword(
  tenantId: string,
  email: string,
  ipAddress?: string
): Promise<void> {
  // Normalize email before any limit check so the key is canonical.
  const normalizedEmail = email.trim().toLowerCase();

  // ── Layer 1: OTP generation rate limit ──────────────────────────────────
  // Scope = tenantId (server-verified, not client-supplied).
  // Must run BEFORE DB lookup so timing is identical whether the user exists.
  if (!isRateLimitDisabled()) {
    const otpLimitResult = await limit([
      otpLayer("otp-gen-min:password-reset", tenantId, normalizedEmail, 1, 1 / 60),
      otpLayer("otp-gen-hour:password-reset", tenantId, normalizedEmail, 5, 5 / 3600),
      otpLayer("otp-gen-day:password-reset", tenantId, normalizedEmail, 10, 10 / 86400),
    ]);

    if (!otpLimitResult.allowed) {
      // Log throttle event, return same generic success — no enumeration.
      console.warn(
        JSON.stringify({
          signal: "otp_generation_throttled",
          scope: tenantId,
          eventType: "password_reset",
          // Do NOT log the email — it is PII
        })
      );
      return; // identical response as the success path
    }
  }

  await withTenant(tenantId, async (client: PoolClient) => {
    const tenantDb = drizzle(client, { schema });

    //look up user
    const [user] = await tenantDb
      .select({ id: schema.users.id, isVerified: schema.users.isVerified })
      .from(schema.users)
      .where(
        and(eq(schema.users.tenantId, tenantId), eq(schema.users.email, normalizedEmail))
      )
      .limit(1);

    //If not found, silent return
    if (!user || !user.isVerified) {
      return;
    }

    await tenantDb
      .update(schema.otpTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.otpTokens.userId, user.id),
          eq(schema.otpTokens.tenantId, tenantId),
          eq(schema.otpTokens.type, "password_reset"),
          sql`used_at IS NULL`
        )
      );

    const { rawOtp, otpHash } = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    //store otp first
    await tenantDb.insert(schema.otpTokens).values({
      tenantId,
      userId: user.id,
      tokenHash: otpHash,
      type: "password_reset",
      expiresAt,
    });

    //logging the event
    await tenantDb.insert(schema.riskLogs).values({
      tenantId,
      userId: user.id,
      eventType: "password_reset_requested",
      mfaTriggered: false,
      ipAddress: ipAddress ?? null,
    });

    //send the email
    await sendOtpEmail(normalizedEmail, rawOtp, "password_reset");
  });
}

//ResetPassword
export interface UserResetPasswordInput {
  tenantId: string;
  email: string;
  otp: string;
  newPassword: string;
  ipAddress?: string;
}
export async function userResetPassword(
  input: UserResetPasswordInput
): Promise<void> {
  const { tenantId, email, newPassword, ipAddress, otp } = input;

  const isPwned = await isPasswordPwned(newPassword);
  if (isPwned) {
    throw new ValidationError(
      "This password has been found in a known data breach. Please choose a different one."
    );
  }

  await withTenant(tenantId, async (client: PoolClient) => {
    const tenantDb = drizzle(client, { schema });

    //check if user exists
    const [user] = await tenantDb
      .select({
        id: schema.users.id,
      })
      .from(schema.users)
      .where(
        and(eq(schema.users.tenantId, tenantId), eq(schema.users.email, email))
      )
      .limit(1);

    //No chance of enumeration
    if (!user) {
      throw new AuthenticationError("Invalid or expired reset code");
    }

    //Checking for otp
    const [token] = await tenantDb
      .select()
      .from(schema.otpTokens)
      .where(
        and(
          eq(schema.otpTokens.userId, user.id),
          eq(schema.otpTokens.tenantId, tenantId),
          eq(schema.otpTokens.type, "password_reset"),
          isNull(schema.otpTokens.usedAt),
          sql`expires_at > NOW()`
        )
      )
      .orderBy(sql`created_at DESC`)
      .limit(1);

    if (!token) {
      throw new AuthenticationError("Invalid or expired reset code");
    }

    const attempts = await chargeAttempt(token.id);
    if (attempts === null) {
      throw new AuthenticationError("Invalid or expired reset code");
    }

    // Verifying otp
    const hashedOtp = sha256(otp);
    const isValid = timingSafeCompare(hashedOtp, token.tokenHash);
    if (!isValid) {
      if (attempts >= MAX_ATTEMPTS) {
        await revokeToken(token.id);
        throw new ValidationError(
          "Submitted wrong code too many times. Request a new one."
        );
      }
      throw new AuthenticationError("Invalid or expired reset code");
    }

    const consumed = await consumeToken(token.id);
    if (!consumed) {
      throw new AuthenticationError("Invalid or expired reset code");
    }

    const hashedPassword = await hashPassword(newPassword);

    //updating password
    await tenantDb
      .update(schema.users)
      .set({
        passwordHash: hashedPassword,
        updatedAt: new Date(),
      })
      .where(
        and(eq(schema.users.id, user.id), eq(schema.users.tenantId, tenantId))
      );

    //revoke all sessions
    await adminDb
      .update(schema.sessions)
      .set({
        isRevoked: true,
      })
      .where(
        and(
          eq(schema.sessions.userId, user.id),
          eq(schema.sessions.tenantId, tenantId)
        )
      );

    // Revoke other unused password_reset tokens for this user
    await revokeUnusedTokens({
      tenantId,
      userId: user.id,
      type: "password_reset",
    });

    //logging event
    await adminDb.insert(schema.riskLogs).values({
      tenantId,
      userId: user.id,
      mfaTriggered: false,
      ipAddress: ipAddress ?? null,
      eventType: "password_reset_completed",
    });
  });
}
