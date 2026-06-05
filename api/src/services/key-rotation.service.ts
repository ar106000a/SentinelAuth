import { eq } from "drizzle-orm";
import { adminDb } from "../db/index";
import { riskLogs, sessions, tenants } from "../db/schema";
import { NotFoundError } from "../utils/error";
import {
  encryptPrivateKey,
  generateRSAKeyPair,
  generateSecretKey,
} from "../utils/crypto";
export interface KeyRotationOutput {
  publicKey: string;
  secretKey: string;
  message: string;
}

export async function RotateTenantKeys(
  tenantId: string,
  ipAddress?: string
): Promise<KeyRotationOutput> {
  const [tenant] = await adminDb
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw new NotFoundError("Tenant");
  }
  const { publicKey, privateKey } = generateRSAKeyPair();
  const privateKeyEncrypted = encryptPrivateKey(privateKey);

  const { rawSecret, secretKeyHash } = generateSecretKey();

  //inserting new secrets to db
  await adminDb
    .update(tenants)
    .set({
      privateKeyEncrypted,
      publicKey,
      secretKeyHash,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  //revoking all sessions with old keys
  await adminDb
    .update(sessions)
    .set({
      isRevoked: true,
    })
    .where(eq(sessions.tenantId, tenantId));

  //logging the event to risk logs
  await adminDb.insert(riskLogs).values({
    tenantId,
    userId: null,
    eventType: "key_rotated",
    riskScore: null,
    mfaTriggered: false,
    ipAddress: ipAddress ?? null,
  });

  return {
    publicKey,
    secretKey: rawSecret,
    message:
      "Key rotated successfully. Update your application with the new credentials. All existing user sessions have been invalidated.",
  };
}
