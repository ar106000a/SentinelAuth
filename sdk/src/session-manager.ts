import { RefreshResponse } from "@sentinelauth/types";
import { HttpClient } from "./client";

/**
 * Owns the in-memory access token and orchestrates refresh calls.
 *
 * This class does NOT and cannot hold the refresh token itself -- it's
 * httpOnly (SENT-1146), meaning JS in this SDK has no more ability to
 * read it than any other script on the page. That's the point. This
 * class only ever calls POST /api/auth/refresh with credentials:
 * "include" and lets the browser attach the cookie automatically.
 */

export class SessionManager {
  private accessToken: string | null = null;
  private refreshPromise: Promise<string> | null = null;
  //   private apiKey: string;
  //   private baseUrl:string;

  constructor(
    private httpClient: HttpClient,
    private onSessionExpired: () => void
  ) {}

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }
  clearSession() {
    this.accessToken = null;
    this.refreshPromise = null;
  }

  /**
   * Single-flight guarded refresh. If a refresh is already in flight,
   * every concurrent caller receives the SAME promise rather than each
   * triggering an independent refresh call -- same shape as
   * fingerprint.ts's cachedPromise (Week 8), reused here for an
   * analogous "many concurrent callers, one underlying async op"
   * problem.
   */

  async refreshIfNeeded(): Promise<string> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.doRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<string> {
    try {
      const result = await this.httpClient.post<RefreshResponse>(
        "/api/auth/refresh",
        {}
      );
      this.accessToken = result.accessToken;
      return result.accessToken;
    } catch (err: unknown) {
      this.accessToken = null;
      this.onSessionExpired();
      throw err;
    }
  }
}
