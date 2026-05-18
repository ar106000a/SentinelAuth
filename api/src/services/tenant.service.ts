import { adminDb } from "../db";
import { otpTokens, tenants } from "../db/schema";
import { eq } from "drizzle-orm";
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
  tenantId: string;
  publicKey: string;
  secretKey: string;
}
export async function registerTenant(
  input: RegisterTenantInput
): Promise<{ message: string }> {
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

  const [tenant] = await adminDb
    .insert(tenants)
    .values({
      name,
      adminEmail,
      passwordHash,
      publicKey: "dummy public key",
      secretKeyHash: "dummy secret key hash",
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
  const [tenant] = await adminDb
    .select()
    .from(tenants)
    .where(eq(tenants.adminEmail, adminEmail))
    .limit(1);

  if (!tenant) {
    throw new NotFoundError("Tenant not found");
  }
  if (tenant.isVerified) {
    throw new ValidationError("Email already Verified");
  }
  const otpHash = sha256(otp);
  const [token] = await adminDb
    .select()
    .from(otpTokens)
    .where(eq(otpTokens.tenantId, tenant.id))
    .limit(1);

  if (!token) {
    throw new AuthenticationError("Invalid or expired verification code");
  }

  const now = new Date();
  if (token.expiresAt < now) {
    throw new AuthenticationError("Verification code has expired");
  }

  if (token.usedAt !== null) {
    throw new AuthenticationError("Verification code has already been used");
  }

  if (token.tokenHash !== otpHash) {
    throw new AuthenticationError("Invalid verification code");
  }

  await adminDb
    .update(otpTokens)
    .set({ usedAt: now })
    .where(eq(otpTokens.id, token.id));
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

  return {
    tenantId: tenant.id,
    publicKey,
    secretKey: rawSecret,
  };
}
