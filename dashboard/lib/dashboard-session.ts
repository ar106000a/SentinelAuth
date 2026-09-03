import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { API_URL } from "@/lib/env";
import type { DashboardMe } from "@/lib/api";

interface SuccessEnvelope<T> {
  success: true;
  data: T;
}
interface ErrorEnvelope {
  success: false;
  error: { message: string; code: string };
}

/**
 * Server Components don't automatically forward the incoming browser
 * request's cookies to an outgoing `fetch` — that only happens for
 * same-origin navigation. Since the API lives on a different origin
 * (localhost:3000 vs. the dashboard's 3001), the `dashboard_session`
 * cookie has to be read explicitly and attached to the `Cookie` header
 * by hand.
 *
 * Wrapped in React's cache() — not Next's fetch cache, which is disabled
 * here via `cache: "no-store"` on purpose since a session check must
 * always be fresh. React's cache() only dedupes calls within a single
 * render pass: the shell layout calls this for the Topbar, and every page
 * under app/app/ will also call it for its own data (Overview needs
 * settings, Settings needs riskThreshold, etc.) — without this, each page
 * load would hit /dashboard/me twice.
 *
 * Redirects to /login if there's no session or the API rejects it — every
 * page under app/app/ relies on this running before rendering.
 */
export const requireDashboardSession = cache(async (): Promise<DashboardMe> => {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("dashboard_session")?.value;

  if (!sessionToken) {
    redirect("/login");
  }

  const res = await fetch(`${API_URL}/dashboard/me`, {
    headers: { Cookie: `dashboard_session=${sessionToken}` },
    cache: "no-store",
  });

  const body = (await res.json()) as
    | SuccessEnvelope<DashboardMe>
    | ErrorEnvelope;

  if (!body.success) {
    redirect("/login");
  }

  return body.data;
});

/**
 * Inverse of requireDashboardSession, for /login: if there's already a
 * valid session, there's no reason to show the login form again.
 */
export async function redirectIfAuthenticated(): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("dashboard_session")?.value;
  if (!sessionToken) return;

  const res = await fetch(`${API_URL}/dashboard/me`, {
    headers: { Cookie: `dashboard_session=${sessionToken}` },
    cache: "no-store",
  });
  const body = (await res.json()) as
    | SuccessEnvelope<DashboardMe>
    | ErrorEnvelope;

  if (body.success) {
    redirect("/app");
  }
}
