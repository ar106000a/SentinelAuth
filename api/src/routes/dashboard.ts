import { Hono } from "hono";
import z from "zod";
import { ValidationError } from "../utils/error";
import { loginTenant, logoutTenant } from "../services/tenant-auth.service";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { env } from "../config/env";
import { successResponse } from "../utils/response";
import { dashboardAuth } from "../middleware/dashboard-auth";
import {
  getTenantSettings,
  updateTenantSettings,
} from "../services/tenant-settings.service";
import { updateSettingsSchema } from "../validators/settings.validator";
import { RotateTenantKeys } from "../services/key-rotation.service";
import { getAuditLogs } from "../services/audit-log.service";
import { auditLogQuerySchema } from "../validators/audit-log.validator";
import { gdprDeleteUser, listTenantUsers } from "../services/user-management.service";
import { userListQuerySchema } from "../validators/user-management.validator";

const dashboard = new Hono();

const loginSchema = z.object({
  adminEmail: z.email().toLowerCase().trim(),
  password: z.string().min(1, "Password required"),
});
dashboard.post("/login", async (c) => {
  const body = await c.req.json().catch(() => {
    throw new ValidationError("Request body must be valid json");
  });

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }
  const result = await loginTenant(parsed.data);

  setCookie(c, "dashboard_session", result.rawToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Strict",
    maxAge: 24 * 60 * 60,
    path: "/",
    domain: env.COOKIE_DOMAIN,
  });
  return successResponse(
    c,
    {
      tenantId: result.tenantId,
      tenantName: result.tenantName,
      message: "Logged in successfully",
    },
    200
  );
});

dashboard.post("logout", dashboardAuth, async (c) => {
  const rawToken = getCookie(c, "dashboard_session");

  if (rawToken) {
    await logoutTenant(rawToken);
  }
  deleteCookie(c, "dashboard_session", {
    path: "/",
    domain: env.COOKIE_DOMAIN,
  });
  return successResponse(c, { message: "Logged out successfully" }, 200);
});
dashboard.get("/me", dashboardAuth, async (c) => {
  console.log("tenantSettings from context:", c.get("tenantSettings"));
  console.log("tenantId from context:", c.get("tenantId"));
  console.log("tenantName from context:", c.get("tenantName"));
  return successResponse(
    c,
    {
      tenantId: c.get("tenantId"),
      tenantName: c.get("tenantName"),
      settings: c.get("tenantSettings"),
    },
    200
  );
});

dashboard.get("/settings", dashboardAuth, async (c) => {
  const tenantId = c.get("tenantId");
  const settings = await getTenantSettings(tenantId);
  return successResponse(c, settings, 200);
});

dashboard.put("/settings", dashboardAuth, async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json().catch(() => {
    throw new ValidationError("Request body must be a valid JSON");
  });
  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }
  const updated = await updateTenantSettings(tenantId, parsed.data);
  return successResponse(c, updated, 200);
});

dashboard.post("/keys/rotate", dashboardAuth, async (c) => {
  const tenantId = c.get("tenantId");
  const ip = c.header("x-forwarded-for") ?? c.header("x-real-ip") ?? "unknown";

  const result = await RotateTenantKeys(tenantId, ip);
  return successResponse(c, result, 200);
});
dashboard.get("/audit-logs", dashboardAuth, async (c) => {
  const tenantId = c.get("tenantId");

  const query = c.req.query();
  const parsed = auditLogQuerySchema.safeParse(query);

  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  const result = await getAuditLogs(tenantId, parsed.data);
  return successResponse(c, result, 200);
});

dashboard.get("/users", dashboardAuth, async (c) => {
  const tenantId = c.get("tenantId");

  const query = c.req.query();
  const parsed = userListQuerySchema.safeParse(query);

  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  const result = await listTenantUsers(tenantId, parsed.data);
  return successResponse(c, result, 200);
});

dashboard.delete("/users/:id", dashboardAuth, async (c) => {
  const tenantId = c.get("tenantId");
  const userId = c.req.param("id");

  if (!userId) {
    throw new ValidationError("User ID is required");
  }

  const result = await gdprDeleteUser(tenantId, userId);
  return successResponse(c, result, 200);
});
export default dashboard;
