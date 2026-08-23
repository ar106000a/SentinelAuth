const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export class DashboardApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "DashboardApiError";
  }
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include", // sends/receives dashboard_session automatically
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  const parsed = await res.json();

  if (!res.ok || parsed.success === false) {
    throw new DashboardApiError(
      parsed.error?.message ?? "Request failed",
      parsed.error?.code ?? "UNKNOWN_ERROR",
      res.status
    );
  }

  return parsed.data as T;
}

export const dashboardApi = {
  login: (adminEmail: string, password: string) =>
    request<{ tenantId: string; tenantName: string; message: string }>(
      "POST",
      "/dashboard/login",
      { adminEmail, password }
    ),
  logout: () => request<{ message: string }>("POST", "/dashboard/logout"),
  me: () =>
    request<{
      tenantId: string;
      tenantName: string;
      settings: { riskThreshold: number; failOpen: boolean };
    }>("GET", "/dashboard/me"),
};
