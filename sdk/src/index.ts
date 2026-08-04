import { HttpClient, SentinelAuthConfig, SentinelAuthError } from "./client.js";
import { tryGetDeviceFingerprint } from "./fingerprint.js";
import type {
  UserRegistrationResponse,
  UserVerifyEmailResponse,
  LoginResponse,
  RefreshResponse,
  ForgotPasswordResponse,
  ResetPasswordResponse,
  MfaSetupResponse,
  MfaVerifyResponse,
} from "@sentinelauth/types";

export { SentinelAuthError };
export type { SentinelAuthConfig };

export class SentinelAuth {
  private http: HttpClient;

  constructor(config: SentinelAuthConfig) {
    if (!config.apiUrl) throw new Error("SentinelAuth: apiUrl is required");
    if (!config.apiKey) throw new Error("SentinelAuth: apiKey is required");
    this.http = new HttpClient(config);
  }

  // ── Registration & verification ────────────────────────────────────────────

  async register(
    email: string,
    password: string
  ): Promise<UserRegistrationResponse> {
    return this.http.post<UserRegistrationResponse>("/api/auth/register", {
      email,
      password,
    });
  }

  async verifyEmail(
    email: string,
    otp: string
  ): Promise<UserVerifyEmailResponse> {
    return this.http.post<UserVerifyEmailResponse>("/api/auth/verify-email", {
      email,
      otp,
    });
  }

  // ── Login lifecycle ─────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<LoginResponse> {
    const fingerprint = await tryGetDeviceFingerprint();
    return this.http.post<LoginResponse>("/api/auth/login", {
      email,
      password,
      fingerprint,
    });
  }

  async logout(accessToken: string): Promise<{ message: string }> {
    return this.http.post<{ message: string }>(
      "/api/auth/logout",
      {},
      { "X-User-Token": accessToken }
    );
  }

  async refresh(refreshToken: string): Promise<RefreshResponse> {
    return this.http.post<RefreshResponse>("/api/auth/refresh", {
      refreshToken,
    });
  }

  // ── Password reset ──────────────────────────────────────────────────────────

  async forgotPassword(email: string): Promise<ForgotPasswordResponse> {
    return this.http.post<ForgotPasswordResponse>("/api/auth/forgot-password", {
      email,
    });
  }

  async resetPassword(
    email: string,
    otp: string,
    newPassword: string
  ): Promise<ResetPasswordResponse> {
    return this.http.post<ResetPasswordResponse>("/api/auth/reset-password", {
      email,
      otp,
      newPassword,
    });
  }

  // ── MFA setup & management (requires an authenticated access token) ────────

  async setupMfa(accessToken: string): Promise<MfaSetupResponse> {
    return this.http.post<MfaSetupResponse>(
      "/api/auth/mfa/setup",
      {},
      { "X-User-Token": accessToken }
    );
  }

  async enableMfa(
    accessToken: string,
    code: string
  ): Promise<{ message: string }> {
    return this.http.post<{ message: string }>(
      "/api/auth/mfa/enable",
      { code },
      { "X-User-Token": accessToken }
    );
  }

  async disableMfa(
    accessToken: string,
    password: string,
    code: string
  ): Promise<{ message: string }> {
    return this.http.post<{ message: string }>(
      "/api/auth/mfa/disable",
      { password, code },
      { "X-User-Token": accessToken }
    );
  }

  // ── MFA login challenge completion (no access token yet — challenge itself is the credential) ──

  async verifyMfa(
    sessionChallenge: string,
    code: string
  ): Promise<MfaVerifyResponse> {
    return this.http.post<MfaVerifyResponse>("/api/auth/mfa/verify", {
      sessionChallenge,
      code,
    });
  }
}

export default SentinelAuth;
