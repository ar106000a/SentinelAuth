import { adminDb } from "../db";
import { otpTokens, tenants } from "../db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  chargeAttempt,
  revokeToken,
  consumeToken,
  timingSafeCompare,
  MAX_ATTEMPTS,
} from "../lib/otp-attempts";
import {
  hashPassword,
  generateRSAKeyPair,
  generateSecretKey,
  generateOtp,
  encryptPrivateKey,
} from "../utils/crypto";
import { isPasswordPwned } from "./hibp.service";
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../utils/error";
import { sendOtpEmail } from "./email.service";
import { sha256 } from "../utils/crypto";

export interface RegisterTenantInput {
  name: string;
  adminEmail: string;
  password: string;
}
export interface RegisterTenantOutput {
  message:string
}
export async function registerTenant(
  input: RegisterTenantInput
): Promise<RegisterTenantOutput> {
  const { name, adminEmail, password } = input;

  if (password.length < 12) {
    throw new ValidationError("Password must be at least 12 characters");
  }
  const isPwned = await isPasswordPwned(password);
  if (isPwned) {
    throw new ValidationError(
      "This password has appeared in a known data breach. Please choose a different password."
    );
  }

  const existing = await adminDb
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.adminEmail, adminEmail));

  if (existing.length > 0) {
    throw new ConflictError("An account with this email adress already exists");
  }

  const passwordHash = await hashPassword(password);
  const { secretKeyHash } = generateSecretKey();

  const [tenant] = await adminDb
    .insert(tenants)
    .values({
      name,
      adminEmail,
      passwordHash,
      publicKey: "dummy public key",
      secretKeyHash,
      isVerified: false,
      settings: { riskThreshold: 0.7, failOpen: true },
    })
    .returning({ id: tenants.id });

  const { rawOtp, otpHash } = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await adminDb.insert(otpTokens).values({
    tenantId: tenant.id,
    tokenHash: otpHash,
    type: "email_verification",
    expiresAt,
  });

  await sendOtpEmail(adminEmail, rawOtp, "email_verification");

  return {
    message:
      "Registration successful. Check your email for a verification code.",
  };
}

export interface VerifyEmailInput {
  adminEmail: string;
  otp: string;
}

export interface VerifyEmailOutput {
  tenantId: string;
  publicKey: string;
  secretKey: string;
}
export async function verifyTenantEmail(
  input: VerifyEmailInput
): Promise<VerifyEmailOutput> {
  const { adminEmail, otp } = input;
  
  //checking if tenant exists
  const [tenant] = await adminDb
    .select()
    .from(tenants)
    .where(eq(tenants.adminEmail, adminEmail))
    .limit(1);

  if (!tenant) {
    throw new NotFoundError("Tenant");
  }

  if (tenant.isVerified) {
    throw new ValidationError("Email already Verified");
  }
  // retrieving active otp token (scoped to tenant, userId IS NULL, type = email_verification, active, newest first)
  const [token] = await adminDb
    .select()
    .from(otpTokens)
    .where(
      and(
        eq(otpTokens.tenantId, tenant.id),
        isNull(otpTokens.userId),
        eq(otpTokens.type, "email_verification"),
        isNull(otpTokens.usedAt),
        sql`expires_at > NOW()`
      )
    )
    .orderBy(sql`created_at DESC`)
    .limit(1);

  if (!token) {
    throw new AuthenticationError("Invalid or expired verification code");
  }

  const attempts = await chargeAttempt(token.id);
  if (attempts === null) {
    throw new AuthenticationError("Invalid or expired verification code");
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
    throw new AuthenticationError("Invalid verification code");
  }

  const consumed = await consumeToken(token.id);
  if (!consumed) {
    throw new AuthenticationError("Invalid or expired verification code");
  }
  const { publicKey, privateKey } = generateRSAKeyPair();
  const { rawSecret, secretKeyHash } = generateSecretKey();

  const privateKeyEncrypted = encryptPrivateKey(privateKey);
  await adminDb
    .update(tenants)
    .set({
      isVerified: true,
      publicKey,
      secretKeyHash,
      privateKeyEncrypted,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenant.id));

    //public key is meant to be public here because it is used only to confirm that one specific JWT is signed by you.
  return {
    tenantId: tenant.id,
    publicKey,
    secretKey: rawSecret,
  };
}
