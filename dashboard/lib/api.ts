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
export function resetTenantPassword(
  adminEmail: string,
  otp: string,
  newPassword: string
) {
  return apiFetch<{ message: string }>("/tenants/reset-password", {
    method: "POST",
    body: JSON.stringify({ adminEmail, otp, newPassword }),
  });
}
/**
 * API_IMPLEMENTATION_DETAILS.md documents the request body and the merge
 * behavior but not the exact success response shape — typed `unknown` for
 * the same reason as dashboardLogin above, rather than guessed.
 */
export function updateTenantSettings(partial: {
  riskThreshold?: number;
  failOpen?: boolean;
}) {
  return apiFetch<unknown>("/dashboard/settings", {
    method: "PUT",
    body: JSON.stringify(partial),
  });
}
export interface RotateKeysResult {
  publicKey: string;
  secretKey: string;
}

export function rotateApiKeys() {
  return apiFetch<RotateKeysResult>("/dashboard/keys/rotate", {
    method: "POST",
  });
}
export interface TenantUser {
  id: string;
  email: string;
  isVerified: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
}

export interface PaginatedUsers {
  entries: TenantUser[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * NOTE: API_IMPLEMENTATION_DETAILS.md documents the `users` table schema
 * and this endpoint's query params (search, page, limit) but not its
 * exact response envelope. TenantUser's fields are the schema fields
 * that are safe and relevant to show on a dashboard — deliberately
 * excludes passwordHash, mfaSecret, and the geo/hour-profile fields.
 * PaginatedUsers' shape follows this codebase's established pagination
 * convention seen elsewhere, not a confirmed contract. Verify field/key
 * names against a real response before relying on this.
 */
export function fetchTenantUsers(
  params: { search?: string; page?: number; limit?: number } = {}
) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch<PaginatedUsers>(`/dashboard/users${qs ? `?${qs}` : ""}`);
}

export function deleteTenantUser(userId: string) {
  return apiFetch<unknown>(`/dashboard/users/${userId}`, { method: "DELETE" });
}

export interface AuditLogEntry {
  id: string;
  eventType: string;
  riskScore: number | null;
  mfaTriggered: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  fingerprint: string | null;
  geoLat: string | null;
  geoLng: string | null;
  features: Record<string, number> | null;
  userEmail: string | null;
  createdAt: string;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function fetchAuditLogs(
  params: {
    eventType?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  } = {}
) {
  const query = new URLSearchParams();
  if (params.eventType) query.set("eventType", params.eventType);
  if (params.fromDate) query.set("fromDate", params.fromDate);
  if (params.toDate) query.set("toDate", params.toDate);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch<AuditLogPage>(`/dashboard/audit-logs${qs ? `?${qs}` : ""}`);
}

export interface LoginVolumeBucket {
  date: string;
  count: number;
}
export interface LoginVolumeResponse {
  buckets: LoginVolumeBucket[];
}

export interface MfaRateResponse {
  totalLogins: number;
  mfaTriggeredCount: number;
  rate: number;
}

export interface RiskDistributionBucket {
  min: number;
  max: number;
  count: number;
}
export interface RiskDistributionResponse {
  buckets: RiskDistributionBucket[];
}

/**
 * PROPOSED ENDPOINTS — agreed with the API owner but NOT YET IMPLEMENTED
 * server-side (Week D Day 1's explicitly flagged backend gap). Calling
 * these today will 404 until the api package ships them; the frontend is
 * written against this agreed contract now so no further wiring is
 * needed once they exist. Contract, as agreed:
 * - login-volume counts EVERY login attempt that reaches risk_logs
 *   (failed-password attempts are logged too), not just fully
 *   successful logins.
 * - mfa-rate counts mfaTriggered (the risk engine's decision to
 *   challenge), not successful MFA completion — a distinct, harder
 *   metric that would need its own endpoint if ever wanted.
 * - risk-distribution buckets the [0,1] score range in fixed 0.2-wide
 *   bins: [0–0.2, 0.2–0.4, 0.4–0.6, 0.6–0.8, 0.8–1.0].
 */
export function fetchLoginVolume(
  params: { fromDate?: string; toDate?: string; granularity?: "day" } = {}
) {
  const query = new URLSearchParams();
  if (params.fromDate) query.set("fromDate", params.fromDate);
  if (params.toDate) query.set("toDate", params.toDate);
  query.set("granularity", params.granularity ?? "day");
  return apiFetch<LoginVolumeResponse>(
    `/dashboard/analytics/login-volume?${query.toString()}`
  );
}

export function fetchMfaRate(
  params: { fromDate?: string; toDate?: string } = {}
) {
  const query = new URLSearchParams();
  if (params.fromDate) query.set("fromDate", params.fromDate);
  if (params.toDate) query.set("toDate", params.toDate);
  const qs = query.toString();
  return apiFetch<MfaRateResponse>(
    `/dashboard/analytics/mfa-rate${qs ? `?${qs}` : ""}`
  );
}

export function fetchRiskDistribution(
  params: { fromDate?: string; toDate?: string } = {}
) {
  const query = new URLSearchParams();
  if (params.fromDate) query.set("fromDate", params.fromDate);
  if (params.toDate) query.set("toDate", params.toDate);
  const qs = query.toString();
  return apiFetch<RiskDistributionResponse>(
    `/dashboard/analytics/risk-distribution${qs ? `?${qs}` : ""}`
  );
}
