import { Hono } from "hono";
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

auth.post("/login", async (c) => {
  const tenantId = c.get("tenantId");

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
    const result = await loginUser({
      tenantId,
      email: parsed.data.email,
      password: parsed.data.password,
    });
    return successResponse(c, result, 200);
  } catch (error) {
    //log failed attempt before re-throwing
    if (
      error instanceof AuthenticationError ||
      error instanceof ForbiddenError
    ) {
      await logFailedLogin(tenantId);
    }
    throw error;
  }
});

auth.post("/logout", userAuth, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.get("userId");
  const token = c.req.header("X-User-Token");
  if (!token) {
    throw new ValidationError("Token absent with request");
  }

  await logoutUser(tenantId, userId!, token);
  return successResponse(c, { message: "Logged out successfully!" }, 200);
});

auth.post("/refresh", async (c) => {
  const tenantId = c.get("tenantId");

  const body = await c.req.json().catch(() => {
    throw new ValidationError("Request body must be a valid json");
  });

  if (!body.refreshToken || typeof body.refreshToken !== "string") {
    throw new ValidationError("refreshTOken is required");
  }
  const result = await refreshAccessToken(tenantId, body.refreshToken);
  return successResponse(c, result, 200);
});

auth.post("/forgot-password", async (c) => {
  const tenantId = c.get("tenantId");
  const ip =
    c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";

  const body = await c.req.json().catch(() => {
    throw new ValidationError("Request body must be valid JSON");
  });

  const parsed = userForgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  await userForgotPassword(tenantId, parsed.data.email, ip);

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
  const ip =
    c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";

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
    ipAddress: ip,
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
export default auth;
