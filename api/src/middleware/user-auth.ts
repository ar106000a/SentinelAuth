import { Context, Next } from "hono";
import { AuthenticationError } from "../utils/error";
import { adminDb } from "../db";
import { tenants } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { hashToken, verifyJwt } from "../utils/jwt";
import { withTenant } from "../db/with-tenant";
import { PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema/index.js";

export async function userAuth(c: Context, next: Next) {
  const tenantId = c.get("tenantId");

  //Extracting JWT from auth headers
  const authHeader = c.req.header("X-User-Token");
  if (!authHeader) {
    throw new AuthenticationError("Missing X-User-Token header");
  }

  //fetching tenant public key for verification
  const [tenant] = await adminDb
    .select({ publicKey: tenants.publicKey })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  //   console.log("🔑 publicKey present:", !!tenant?.publicKey);
  if (!tenant?.publicKey) {
    throw new AuthenticationError("Tenant configuration error");
  }

  //Verify JWT signature
  let payload;
  try {
    payload = verifyJwt(authHeader, tenant.publicKey);
    // console.log(
    //   "✅ JWT verified, sub:",
    //   payload.sub,
    //   "tenantId:",
    //   payload.tenantId
    // );
  } catch {
    // console.log("❌ verifyJwt threw:", e);
    throw new AuthenticationError("Invalid or expired token");
  }
  //   console.log("tenantId from context:", tenantId);
  //   console.log("tenantId from token:", payload.tenantId);

  //checking payload signature validation
  if (payload.tenantId !== tenantId) {
    throw new AuthenticationError("Token tenant mismatch");
  }

  const tokenHash = hashToken(authHeader);

  await withTenant(tenantId, async (client: PoolClient) => {
    const tenantDb = drizzle(client, { schema });

    const [session] = await tenantDb
      .select({
        id: schema.sessions.id,
        isRevoked: schema.sessions.isRevoked,
        expiresAt: schema.sessions.expiresAt,
      })
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.tokenHash, tokenHash),
          eq(schema.sessions.userId, payload.sub)
        )
      )
      .limit(1);

    // console.log("tokenHash:", tokenHash);
    // console.log("payload.sub:", payload.sub);
    // console.log("session found:", session);
    if (!session) {
      //   console.log("❌ Session not found");
      throw new AuthenticationError("Session Not Found");
    }

    if (session.isRevoked) {
      //   console.log("❌ Session Revoked");
      throw new AuthenticationError("Session has been revoked");
    }
    if (new Date() > session.expiresAt) {
      //   console.log("❌ Session expired   ");
      throw new AuthenticationError("Session has expired");
    }

    c.set("userId", payload.sub);
  });
  await next();
}
