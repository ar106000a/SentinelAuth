export const SDK_VERSION = "0.0.1";
import { HttpClient, SentinelAuthConfig, SentinelAuthError } from "./client.js";
import type {
  UserRegistrationResponse,
  UserVerifyEmailResponse,
  LoginResponse,
  RefreshResponse,
} from "@sentinelauth/types";
import { tryGetDeviceFingerprint } from "./fingerprint.js";
export {
  getDeviceFingerprint,
  tryGetDeviceFingerprint,
} from "./fingerprint.js";

export { SentinelAuthError };
export { SentinelAuthLoginElement } from "./components/login-form.js";
export type { SentinelAuthConfig };

export class SentinelAuth {
  private http: HttpClient;

  constructor(config: SentinelAuthConfig) {
    if (!config.apiUrl) {
      throw new Error("SentinelAuth: apiUrl is required");
    }
    if (!config.publicKey) {
      throw new Error("SentinelAuth: publicKey is required");
    }
    this.http = new HttpClient(config);
  }

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
}

export default SentinelAuth;
