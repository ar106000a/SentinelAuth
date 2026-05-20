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
