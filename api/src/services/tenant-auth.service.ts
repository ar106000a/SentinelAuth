import { eq } from "drizzle-orm";
import { adminDb } from "../db";
import { tenants, tenantSessions } from "../db/schema";
import { AuthenticationError, ForbiddenError } from "../utils/error";
import { sha256, verifyPassword } from "../utils/crypto";
import { randomBytes } from "crypto";

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
