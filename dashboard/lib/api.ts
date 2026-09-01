import { API_URL } from "@/lib/env";

/**
 * Mirrors the error envelope's `code` field
 * (AppError hierarchy in API_IMPLEMENTATION_DETAILS.md §9) — narrow, not
 * exhaustive; add codes here as the dashboard needs to branch on them.
 */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;

  constructor(message: string, code: ApiErrorCode, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  timestamp: string;
}

interface ErrorEnvelope {
  success: false;
  error: { message: string; code: ApiErrorCode };
  timestamp: string;
}

/**
 * Client-side fetch wrapper for the dashboard's own browser calls to
 * `/dashboard/*`. Always sends credentials so the `dashboard_session`
 * HttpOnly cookie goes along — this only works because the API's CORS
 * config explicitly allows `http://localhost:3001` with credentials.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  console.log("apiFetch hitting:", `${API_URL}${path}`);
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const body = (await res.json()) as SuccessEnvelope<T> | ErrorEnvelope;

  if (!body.success) {
    throw new ApiError(body.error.message, body.error.code, res.status);
  }

  return body.data;
}

export interface DashboardMe {
  tenantId: string;
  tenantName: string;
  settings: { riskThreshold: number; failOpen: boolean };
}

/**
 * API_IMPLEMENTATION_DETAILS.md documents the request body and the cookie
 * side effect but not the exact `data` payload shape on success — the
 * cookie is what actually matters (the caller doesn't need the response
 * body, just a thrown ApiError on failure), so this is typed `unknown`
 * rather than guessed. Tighten it once the real response is confirmed.
 */
export function dashboardLogin(adminEmail: string, password: string) {
  return apiFetch<unknown>("/dashboard/login", {
    method: "POST",
    body: JSON.stringify({ adminEmail, password }),
  });
}

export function dashboardLogout() {
  return apiFetch<void>("/dashboard/logout", { method: "POST" });
}
export function registerTenant(
  name: string,
  adminEmail: string,
  password: string
) {
  return apiFetch<{ message: string }>("/tenants/register", {
    method: "POST",
    body: JSON.stringify({ name, adminEmail, password }),
  });
}

export interface TenantVerifyResult {
  tenantId: string;
  publicKey: string;
  secretKey: string;
  message: string;
}

export function verifyTenantEmail(adminEmail: string, otp: string) {
  return apiFetch<TenantVerifyResult>("/tenants/verify-email", {
    method: "POST",
    body: JSON.stringify({ adminEmail, otp }),
  });
}
export function requestTenantPasswordReset(adminEmail: string) {
  return apiFetch<{ message: string }>("/tenants/forgot-password", {
    method: "POST",
    body: JSON.stringify({ adminEmail }),
  });
}
