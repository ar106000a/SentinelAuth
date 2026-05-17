import { Hono } from "hono";
import {
  registerTenantSchema,
  verifyEmailSchema,
} from "../validators/tenant.validator";
import { registerTenant, verifyTenantEmail } from "../services/tenant.service";
import { successResponse } from "../utils/response";
import { ValidationError } from "../utils/error";

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
export default tenants;
