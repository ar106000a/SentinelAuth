import { HttpClient, SentinelAuthConfig, SentinelAuthError } from "./client.js";
import { tryGetDeviceFingerprint } from "./fingerprint.js";
import type {
  UserRegistrationResponse,
  UserVerifyEmailResponse,
  LoginResponse,
  // RefreshResponse,
  ForgotPasswordResponse,
  ResetPasswordResponse,
  MfaSetupResponse,
  MfaVerifyResponse,
  RefreshResponse,
} from "@sentinelauth/types";
import { SessionManager } from "./session-manager.js";

export { SentinelAuthError };
export type { SentinelAuthConfig };

export class SentinelAuth extends EventTarget {
  private http: HttpClient;
  private sessionManager: SessionManager;

  constructor(config: SentinelAuthConfig) {
    super();
    if (!config.apiUrl) throw new Error("SentinelAuth: apiUrl is required");
    if (!config.apiKey) throw new Error("SentinelAuth: apiKey is required");
    this.http = new HttpClient(config);
    this.sessionManager = new SessionManager(this.http, () => {
      dispatchEvent(new CustomEvent("session-expired"));
    });
    this.http.attachSessionManager(this.sessionManager);
  }

  /**
   * Centralized token arming. Called once after login/MFA-verify
   * succeeds to transparently arm every component and the 401
   * interceptor -- login()/verifyMfa() already call this internally,
   * so most tenants never need to call it themselves.
   */
  setAccessToken(accessToken: string): void {
    this.sessionManager.setAccessToken(accessToken);
  }

  getAccessToken(): string | null {
    return this.sessionManager.getAccessToken();
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
    const result = await this.http.post<LoginResponse>("/api/auth/login", {
      email,
      password,
      fingerprint,
    });

    if (!result.mfaRequired) {
      this.sessionManager.setAccessToken(result.accessToken);
    }
    return result;
  }

  async logout(accessToken?: string): Promise<{ message: string }> {
    const token = accessToken ?? this.sessionManager.getAccessToken();
    if (!token) {
      throw new SentinelAuthError(
        "Sentinel: No Access token found to logout",
        "AUTHENTICATION_ERROR",
        401
      );
    }
    const result = await this.http.post<{ message: string }>(
      "/api/auth/logout",
      {},
      { "X-User-Token": token }
    );
    this.sessionManager.clearSession();
    return result;
  }

  /** Explicit refresh, if a tenant wants to trigger one manually rather
   * than relying purely on the automatic 401 interceptor. */
  async refresh(): Promise<RefreshResponse> {
    const accessToken = await this.sessionManager.refreshIfNeeded();
    return { accessToken };
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

  // ── MFA setup & management ──────────────────────────────────────────────────
  // accessToken remains an explicit, optional param on all three -- falls
  // back to the SessionManager's current token if omitted. This keeps every
  // existing direct-SDK caller and test suite working unchanged, while
  // letting components (retrofitted below) stop requiring it entirely.

  async setupMfa(accessToken?: string): Promise<MfaSetupResponse> {
    const token = this.resolveToken(accessToken);
    const result = await this.http.post<MfaSetupResponse>(
      "/api/auth/mfa/setup",
      {},
      { "X-User-Token": token }
    );
    return result;
  }

  async enableMfa(
    accessToken: string | undefined,
    code: string
  ): Promise<{ message: string }> {
    const token = this.resolveToken(accessToken);
    return this.http.post<{ message: string }>(
      "/api/auth/mfa/enable",
      { code },
      { "X-User-Token": token }
    );
  }

  async disableMfa(
    accessToken: string | undefined,
    password: string,
    code: string
  ): Promise<{ message: string }> {
    return this.http.post<{ message: string }>(
      "/api/auth/mfa/disable",
      { password, code },
      { "X-User-Token": this.resolveToken(accessToken) }
    );
  }

  // ── MFA login challenge completion (no access token yet — challenge itself is the credential) ──

  async verifyMfa(
    sessionChallenge: string,
    code: string
  ): Promise<MfaVerifyResponse> {
    const result = await this.http.post<MfaVerifyResponse>(
      "/api/auth/mfa/verify",
      {
        sessionChallenge,
        code,
      }
    );
    this.sessionManager.setAccessToken(result.accessToken);
    return result;
  }

  private resolveToken(explicit?: string): string {
    const token = explicit ?? this.sessionManager.getAccessToken();
    if (!token) {
      throw new SentinelAuthError(
        "SentinelAuth: no access token available. Log in first, or pass one explicitly.",
        "AUTHENTICATION_ERR",
        401
      );
    }
    return token;
  }
}

export default SentinelAuth;
