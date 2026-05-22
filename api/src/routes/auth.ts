import { Hono } from "hono";
import { ValidationError } from "../utils/error";
import {
  registerUserSchema,
  verifyUserEmailSchema,
  loginUserSchema,
} from "../validators/user.validator";
import { registerUser, verifyUserEmail } from "../services/user.service";
import {
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

  const result = await loginUser({
    tenantId,
    email: parsed.data.email,
    password: parsed.data.password,
  });
  return successResponse(c, result, 200);
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
export default auth;
