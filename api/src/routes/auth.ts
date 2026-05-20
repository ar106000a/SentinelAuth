import { Hono } from "hono";
import { ValidationError } from "../utils/error";
import {
  registerUserSchema,
  verifyUserEmailSchema,
} from "../validators/user.validator";
import { registerUser, verifyUserEmail } from "../services/user.service";
import { successResponse } from "../utils/response";

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
export default auth;
