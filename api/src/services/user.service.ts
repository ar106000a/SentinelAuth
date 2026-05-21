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
import { and, eq } from "drizzle-orm";
import { generateOtp, hashPassword, sha256 } from "../utils/crypto";
import { sendOtpEmail } from "./email.service";

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
          eq(schema.otpTokens.type, "email_verification")
        )
      )
      .limit(1);

    if (!token) {
      throw new AuthenticationError("Invalid or expired verification code.");
    }
    //check expiry
    if (new Date() > token.expiresAt) {
      throw new AuthenticationError("Otp token is expired");
    }

    //check if already used
    if (token.usedAt !== null) {
      throw new AuthenticationError("Verification code has already been used.");
    }
    const otpHash = sha256(otp);
    if (token.tokenHash !== otpHash) {
      throw new AuthenticationError("Invalid verification code.");
    }

    //Mark token used and user verified
    await tenantDb
      .update(schema.otpTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(schema.otpTokens.tenantId, tenantId),
          eq(schema.otpTokens.id, token.id)
        )
      );

    await tenantDb
      .update(schema.users)
      .set({ isVerified: true, updatedAt: new Date() })
      .where(
        and(eq(schema.users.tenantId, tenantId), eq(schema.users.id, user.id))
      );
  });
  return { message: "Email Verified Successfully, You may now log in." };
}
