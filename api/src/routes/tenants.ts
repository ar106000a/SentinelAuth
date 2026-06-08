import { Hono } from "hono";
import {
  registerTenantSchema,
  tenantForgotPasswordSchema,
  tenantResetPasswordSchema,
  verifyEmailSchema,
} from "../validators/tenant.validator";
import { registerTenant, verifyTenantEmail } from "../services/tenant.service";
import { successResponse } from "../utils/response";
import { ValidationError } from "../utils/error";
import {
  tenantForgotPassword,
  tenantResetPassword,
} from "../services/tenant-auth.service";

const tenants = new Hono();

tenants.post("/register", async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError("Request must be a valid JSON");
  });
  const parsed = registerTenantSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  const result = await registerTenant(parsed.data);
  return successResponse(c, result, 201);
});

tenants.post("/verify-email", async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError("Request body must be a valid json");
  });

  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }
  const result = await verifyTenantEmail(parsed.data);
  return successResponse(c, {
    ...result,
    message:
      "Email verified. Store your secret key securely- it will not be shown again.",
  });
});

tenants.post("/forgot-password", async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError("Request body must be valid JSON");
  });

  const parsed = tenantForgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  // Always return 200 — never reveal if email exists
  await tenantForgotPassword(parsed.data.adminEmail);

  return successResponse(
    c,
    { message: "If this email is registered, a reset code has been sent." },
    200
  );
});

tenants.post("/reset-password", async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError("Request body must be valid JSON");
  });

  //attaining ip address
  const ip =
    c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";

  const parsed = tenantResetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  await tenantResetPassword(parsed.data, ip);

  return successResponse(
    c,
    {
      message:
        "Password reset successfully. Please log in with your new password.",
    },
    200
  );
});
export default tenants;
