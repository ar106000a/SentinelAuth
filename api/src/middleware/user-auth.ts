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
import { env } from "../config/env";

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

  if (!tenant?.publicKey) {
    throw new AuthenticationError("Tenant configuration error");
  }

  //Verify JWT signature
  let payload;
  try {
    payload = verifyJwt(authHeader, tenant.publicKey);
  } catch {
    throw new AuthenticationError("Invalid or expired token");
  }

  if (!payload || typeof payload.sub !== "string" || !payload.sub) {
    throw new AuthenticationError(
      "Malformed token payload: missing user identity"
    );
  }
  //checking payload signature validation
  if (payload.tenantId !== tenantId) {
    throw new AuthenticationError("Token tenant mismatch");
  }

  const tokenHash = hashToken(authHeader);

  await withTenant(tenantId, async (client: PoolClient) => {
    const tenantDb = drizzle(client, { schema });

    if (env.REQ_BODY_TOKENS) {
      // ── Body mode ───────────────────────────────────────────────────────────
      // Do NOT require hash equality — that would invalidate tokens held by
      // other tabs every time any tab refreshes.
      // Instead: verify the session exists and is not revoked.
      const [session] = await tenantDb
        .select({
          id: schema.sessions.id,
          isRevoked: schema.sessions.isRevoked,
          expiresAt: schema.sessions.expiresAt,
        })
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.id, payload.sessionId as string),
            eq(schema.sessions.userId, payload.sub),
            eq(schema.sessions.tenantId, tenantId)
          )
        )
        .limit(1);

      if (!session) {
        throw new AuthenticationError("Session Not Found");
      }
      if (session.isRevoked) {
        throw new AuthenticationError("Session has been revoked");
      }
      if (new Date() > session.expiresAt) {
        throw new AuthenticationError("Session has expired");
      }
    } else {
      // ── Cookie mode ─────────────────────────────────────────────────────────
      // Original hash-equality check unchanged.
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

      if (!session) {
        throw new AuthenticationError("Session Not Found");
      }
      if (session.isRevoked) {
        throw new AuthenticationError("Session has been revoked");
      }
      if (new Date() > session.expiresAt) {
        throw new AuthenticationError("Session has expired");
      }
    }

    c.set("userId", payload.sub);
  });
  await next();
}
