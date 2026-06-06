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
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  mfaRequired: boolean;
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
