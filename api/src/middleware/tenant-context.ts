import { Context, Next } from "hono";
import { adminDb } from "../db";
import { tenants } from "../db/schema";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import { AuthenticationError } from "../utils/error";

export async function tenantContext(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthenticationError("Missing or invalid Authorization header");
  }

  const secretKey = authHeader.replace("Bearer ", "");
  const secretKeyHash = createHash("sha256").update(secretKey).digest("hex");

  // Look up tenant by secret key hash
  const [tenant] = await adminDb
    .select({
      id: tenants.id,
      name: tenants.name,
    })
    .from(tenants)
    .where(eq(tenants.secretKeyHash, secretKeyHash))
    .limit(1);

  if (!tenant) {
    throw new AuthenticationError("Invalid API key");
  }

  // Store tenant in context for use in route handlers
  c.set("tenantId", tenant.id);
  c.set("tenantName", tenant.name);

  await next();
}
