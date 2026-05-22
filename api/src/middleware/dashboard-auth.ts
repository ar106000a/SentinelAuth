import { Next, Context } from "hono";
import { getCookie } from "hono/cookie";
import { AuthenticationError } from "../utils/error";
import { validateDashboardSession } from "../services/tenant-auth.service";

export async function dashboardAuth(c: Context, next: Next) {
  const rawToken = getCookie(c, "dashboard_session");
  if (!rawToken) {
    throw new AuthenticationError("No session cookie found. Please log in.");
  }
  const session = await validateDashboardSession(rawToken);
  //we arent validating anything regarding the token here because the validateService handles it all

  c.set("tenantId", session.tenantId);
  c.set("tenantName", session.tenantName);
  c.set("tenantSettings", session.settings);
  await next();
}
