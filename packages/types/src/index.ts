// Shared response shapes — SDK and Dashboard consume these
export interface AuthResponse {
  accessToken: string;
  mfaRequired: boolean;
  riskScore?: number;
}

export interface TenantRegistrationResponse {
  tenantId: string;
  publicKey: string;
  secretKey: string;
  message: string;
}

export interface VerifyEmailResponse {
  tenantId: string;
  publicKey: string;
  secretKey: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
  };
  timestamp: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}
export interface UserRegistrationResponse {
  message: string;
}

export interface UserVerifyEmailResponse {
  message: string;
}
// When MFA is not required — all token fields present
export interface LoginSuccessResponse {
  accessToken: string;
  refreshToken: string;
  mfaRequired: false;
  userId: string;
}

// When MFA is required — challenge fields present, no tokens
export interface LoginMfaResponse {
  mfaRequired: true;
  sessionChallenge: string;
  userId: string;
}

// Union — what the login endpoint actually returns
export type LoginResponse = LoginSuccessResponse | LoginMfaResponse;

export interface MfaVerifyResponse {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

export interface RefreshResponse {
  accessToken: string;
}
export interface TenantLoginResponse {
  tenantId: string;
  tenantName: string;
  message: string;
}

export interface DashboardMeResponse {
  tenantId: string;
  tenantName: string;
  settings: {
    riskThreshold: number;
    failOpen: boolean;
  };
}
export interface TenantSettings {
  riskThreshold: number;
  failOpen: boolean;
}
export interface KeyRotationResponse {
  publicKey: string;
  secretKey: string;
  message: string;
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
export interface UserListEntry {
  id: string;
  email: string;
  isVerified: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
}

export interface UserListPage {
  entries: UserListEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface GdprDeleteResult {
  userId: string;
  message: string;
}
export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordResponse {
  message: string;
}

export interface MfaSetupResponse {
  secret: string;
  qrCodeDataUri: string;
}
