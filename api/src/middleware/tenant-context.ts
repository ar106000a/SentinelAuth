import { Context, Next } from "hono";
import { adminDb } from "../db";
import { tenants } from "../db/schema";
import { eq } from "drizzle-orm";
import { sha256 } from "../utils/crypto";
import { AuthenticationError, ForbiddenError } from "../utils/error";

export async function tenantContext(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader || !authHeader?.startsWith("Bearer ")) {
    throw new AuthenticationError("Missing or invalid Authorization header");
  }

  const secretKey = authHeader.slice(7);
  if (!secretKey || secretKey.length === 0) {
    throw new AuthenticationError("API key cannot be empty");
  }
  const secretKeyHash = sha256(secretKey);

  // Look up tenant by secret key hash
  const [tenant] = await adminDb
    .select({
      id: tenants.id,
      name: tenants.name,
      isVerified: tenants.isVerified,
      settings: tenants.settings,
    })
    .from(tenants)
    .where(eq(tenants.secretKeyHash, secretKeyHash))
    .limit(1);

  if (!tenant) {
    throw new AuthenticationError("Invalid API key");
  }
  if (!tenant.isVerified) {
    throw new ForbiddenError(
      "Tenant email not verified. Complete email verification before making API calls."
    );
  }

  // Store tenant in context for use in route handlers
  c.set("tenantId", tenant.id);
  c.set("tenantName", tenant.name);
  c.set("tenantSettings", tenant.settings);

  await next();
}
