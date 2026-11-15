import { Context, Hono } from "hono";
import {
  AuthenticationError,
  ForbiddenError,
  ValidationError,
} from "../utils/error";
import {
  registerUserSchema,
  verifyUserEmailSchema,
  loginUserSchema,
  userForgotPasswordSchema,
  userResetPasswordSchema,
} from "../validators/user.validator";
import {
  registerUser,
  userForgotPassword,
  userResetPassword,
  verifyUserEmail,
} from "../services/user.service";
import {
  logFailedLogin,
  loginUser,
  logoutUser,
  refreshAccessToken,
} from "../services/auth.service";
import { successResponse } from "../utils/response";
import { userAuth } from "../middleware/user-auth";
import { adminDb } from "../db";
import { tenants, users } from "../db/schema";
import { and, eq } from "drizzle-orm";
import {
  disableMfa,
  enableMfa,
  setupMfa,
  verifyMfaChallenge,
} from "../services/mfa.service";
import {
  mfaCodeSchema,
  mfaDisableSchema,
  mfaVerifySchema,
} from "../validators/mfa.validator";
import { credentialStuffingGuard } from "../middleware/credential-stuffing";
import {
  recordFailedAttempt,
  recordSuccessfulLogin,
} from "../lib/credential-stuffing";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { env } from "../config/env";
import { clientIp } from "../lib/client-ip";
import { z } from "zod";
import { verifyRefreshToken } from "../utils/jwt";

/**
 * Cookie attributes helper.
 * Per P0-6 requirement #48: One helper owns cookie attributes; no Domain attribute.
 */
function setRefreshCookie(c: Context, token: string): void {
  setCookie(c, "sentinel_refresh", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Strict",
    maxAge: 24 * 60 * 60,
    path: "/",
  });
}

function deleteRefreshCookie(c: Context): void {
  deleteCookie(c, "sentinel_refresh", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Strict",
    path: "/",
    maxAge: 0,
  });
}

const auth = new Hono();
auth.post("/register", async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json().catch(() => {
    throw new ValidationError("Request body must be a valid json");
  });
  const parsed = registerUserSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  const result = await registerUser({
    tenantId,
    email: parsed.data.email,
    password: parsed.data.password,
  });

  return successResponse(c, result, 201);
});

auth.post("/verify-email", async (c) => {
  const tenantId = c.get("tenantId");

  const body = await c.req.json().catch(() => {
    throw new ValidationError("Request body must be a valid json");
  });

  const parsed = verifyUserEmailSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  const result = await verifyUserEmail({
    tenantId,
    email: parsed.data.email,
    otp: parsed.data.otp,
  });
  return successResponse(c, result, 200);
});

//Not to confuse credential stuffing guard with rate limiting although they look quite similar. Rate limit will limit for an instant and ll allow as soon as tokens start to refill. But this guard tracks wrong attempts and hard lock that ip for 30 minutes even if rate limit allows it. 
auth.post("/login", credentialStuffingGuard, async (c) => {
  const tenantId = c.get("tenantId");
  const ip = clientIp(c);
  const userAgent = c.req.header("user-agent") ?? "unknown";
  const body = await c.req.json().catch(() => {
    throw new ValidationError("Request body must be a valid json.");
  });
  const parsed = loginUserSchema.safeParse(body);

  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }
  try {
    const { refreshToken, ...result } = await loginUser({
      tenantId,
      email: parsed.data.email,
      password: parsed.data.password,
      ipAddress: ip,
      userAgent,
      fingerprint: parsed.data.fingerprint ?? null,
    });
    if (ip !== null) {
      await recordSuccessfulLogin(ip);
    }

    if (env.REQ_BODY_TOKENS) {
      // Body mode: return refresh token in JSON, no cookie.
      const responseData = refreshToken ? { ...result, refreshToken } : result;
      return successResponse(c, responseData, 200);
    } else {
      // Cookie mode: set HttpOnly cookie, strip from body.
      if (refreshToken) {
        setRefreshCookie(c, refreshToken);
      }
      return successResponse(c, result, 200);
    }
  } catch (error) {
    //log failed attempt before re-throwing
    if (
      error instanceof AuthenticationError ||
      error instanceof ForbiddenError
    ) {
      if (ip !== null) {
        await recordFailedAttempt(ip, parsed.data.email);
      }
      await logFailedLogin(tenantId);
    }
    throw error;
  }
});

auth.post("/logout", async (c) => {
  const tenantId = c.get("tenantId");

  if (env.REQ_BODY_TOKENS) {
    let body: { refreshToken?: unknown } | null;
    try {
      body = (await c.req.json()) as { refreshToken?: unknown };
    } catch {
      body = null;
    }

    if (body && typeof body.refreshToken === "string") {
      const payload = verifyRefreshToken(body.refreshToken);
      if (payload.tenantId !== tenantId) {
        throw new AuthenticationError("Token tenant mismatch");
      }
      await logoutUser(tenantId, payload.sub, "", body.refreshToken);
      return successResponse(c, { message: "Logged out successfully!" }, 200);
    }
  }

  // Fallback: validate user with userAuth
  await userAuth(c, async () => {});

  const userId = c.get("userId");
  const token = c.req.header("X-User-Token");
  if (!token) {
    throw new ValidationError("Token absent with request");
  }

  if (!env.REQ_BODY_TOKENS) {
    deleteRefreshCookie(c);
  }

  await logoutUser(tenantId, userId!, token);
  return successResponse(c, { message: "Logged out successfully!" }, 200);
});

auth.post("/refresh", async (c) => {
  const tenantId = c.get("tenantId");

  let refreshToken: string | undefined;

  if (env.REQ_BODY_TOKENS) {
    // Body mode: read refresh token from JSON body.
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      throw new AuthenticationError(
        "MISSING_BODY_TOKEN: Request body must be valid JSON with refreshToken in body-token mode",
        "MISSING_BODY_TOKEN"
      );
    }
    const parsed = z.object({ refreshToken: z.string() }).safeParse(body);
    if (!parsed.success) {
      throw new AuthenticationError(
        "MISSING_BODY_TOKEN: refreshToken is required in body when REQ_BODY_TOKENS=true",
        "MISSING_BODY_TOKEN"
      );
    }
    refreshToken = parsed.data.refreshToken;
  } else {
    // Cookie mode: read from HttpOnly cookie.
    const cookie = getCookie(c, "sentinel_refresh");
    if (!cookie || typeof cookie !== "string") {
      throw new AuthenticationError("refreshToken is required");
    }
    refreshToken = cookie;
  }

  const result = await refreshAccessToken(tenantId, refreshToken);

  if (env.REQ_BODY_TOKENS) {
    // Body mode: return both tokens in JSON.
    return successResponse(c, result, 200);
  } else {
    // Cookie mode: rotate the cookie, strip refresh from body.
    if (result.refreshToken) {
      setRefreshCookie(c, result.refreshToken);
    }
    return successResponse(c, { accessToken: result.accessToken }, 200);
  }
});

auth.post("/forgot-password", async (c) => {
  const tenantId = c.get("tenantId");
  const ip = clientIp(c);

  const body = await c.req.json().catch(() => {
    throw new ValidationError("Request body must be valid JSON");
  });

  const parsed = userForgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  await userForgotPassword(tenantId, parsed.data.email, ip ?? undefined);

  return successResponse(
    c,
    {
      message: "If this email is registered, a reset code has been sent.",
    },
    200
  );
});

auth.post("/reset-password", async (c) => {
  const tenantId = c.get("tenantId");
  const ip = clientIp(c);

  const body = await c.req.json().catch(() => {
    throw new ValidationError("Request body must be valid JSON");
  });

  const parsed = userResetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  await userResetPassword({
    tenantId,
    email: parsed.data.email,
    otp: parsed.data.otp,
    newPassword: parsed.data.newPassword,
    ipAddress: ip ?? undefined,
  });

  return successResponse(
    c,
    {
      message:
        "Password reset successfully. Please log in with your new password.",
    },
    200
  );
});

auth.post("/mfa/setup", userAuth, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");

  // Fetch tenant name and user email for QR code labeling
  const [tenant] = await adminDb
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const [user] = await adminDb
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
    .limit(1);

  const result = await setupMfa(
    userId,
    tenantId,
    tenant?.name ?? "SentinelAuth",
    user?.email ?? ""
  );

  return successResponse(c, result, 200);
});

auth.post("/mfa/enable", userAuth, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");

  const body = await c.req.json().catch(() => {
    throw new ValidationError("Request body must be valid JSON");
  });

  const parsed = mfaCodeSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  await enableMfa(tenantId, userId, parsed.data.code);

  return successResponse(c, { message: "MFA enabled successfully" }, 200);
});

auth.post("/mfa/disable", userAuth, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId")!;

  const body = await c.req.json().catch(() => {
    throw new ValidationError("Request body must be valid JSON");
  });

  const parsed = mfaDisableSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  await disableMfa({
    tenantId,
    userId,
    password: parsed.data.password,
    code: parsed.data.code,
  });

  return successResponse(c, { message: "MFA disabled successfully" }, 200);
});

// Note: NOT behind userAuth — user isn't authenticated yet at this point
auth.post("/mfa/verify", async (c) => {
  const tenantId = c.get("tenantId");
  const ip = clientIp(c);
  const body = await c.req.json().catch(() => {
    throw new ValidationError("Request body must be valid JSON");
  });

  const parsed = mfaVerifySchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  const { refreshToken, ...result } = await verifyMfaChallenge({
    tenantId,
    sessionChallenge: parsed.data.sessionChallenge,
    code: parsed.data.code,
    ipAddress: ip ?? undefined,
    fingerprint: parsed.data.fingerprint ?? null,
  });

  if (env.REQ_BODY_TOKENS) {
    // Body mode: return refresh token in JSON response.
    return successResponse(c, { ...result, refreshToken }, 200);
  } else {
    // Cookie mode: set HttpOnly cookie, strip from body.
    if (refreshToken) {
      setRefreshCookie(c, refreshToken);
    }
    return successResponse(c, result, 200);
  }
});
export default auth;
