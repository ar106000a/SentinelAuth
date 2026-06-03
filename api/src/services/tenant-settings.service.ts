import { eq } from "drizzle-orm";
import { adminDb } from "../db/index";
import { tenants } from "../db/schema";
import { NotFoundError, ValidationError } from "../utils/error";

export interface TenantSettings {
  riskThreshold: number;
  failOpen: boolean;
}

export async function getTenantSettings(
  tenantId: string
): Promise<TenantSettings> {
  const [tenant] = await adminDb
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) {
    throw new NotFoundError("Tenant");
  }

  return tenant.settings as TenantSettings;
}

export async function updateTenantSettings(
  tenantId: string,
  updates: Partial<TenantSettings>
): Promise<TenantSettings> {
  //fetching tenant
  const current = await getTenantSettings(tenantId);

  const merged: TenantSettings = {
    riskThreshold: updates.riskThreshold ?? current.riskThreshold,
    failOpen: updates.failOpen ?? current.failOpen,
  };

  if (merged.riskThreshold < 0 || merged.riskThreshold > 1) {
    throw new ValidationError("Risk Threshold must be between 0.0 and 1.0.");
  }
  const [updated] = await adminDb
    .update(tenants)
    .set({
      settings: merged,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId))
    .returning({ settings: tenants.settings });

  return updated.settings as TenantSettings;
}
