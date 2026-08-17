import type { SessionManager } from "./session-manager";

export interface SentinelAuthConfig {
  apiUrl: string;
  apiKey: string; // the tenant's secretKey — used as Bearer token
}

export class SentinelAuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "SentinelAuthError";
  }
}

export class HttpClient {
  private baseUrl: string;
  private apiKey: string;
  private sessionManager: SessionManager | null = null;

  constructor(config: SentinelAuthConfig) {
    this.baseUrl = config.apiUrl.replace(/\/$/, ""); // strip trailing slash
    this.apiKey = config.apiKey;
  }

  /** Wired up by SentinelAuth once both instances exist -- same
   * deferred-wiring convention as every component's setSdk(). */
  attachSessionManager(sessionmanager: SessionManager) {
    this.sessionManager = sessionmanager;
  }

  private async request<TResponse>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    extraHeaders: Record<string, string>,
    isRetry: boolean
  ): Promise<TResponse> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      credentials: "include",
      headers: {
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
        ...extraHeaders,
        Authorization: `Bearer ${this.apiKey}`,
      },
      ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
    });
    const parsed = await res.json();

    if (res.ok && parsed.success !== false) {
      return parsed.data as TResponse;
    }

    // Only ever attempt a refresh-and-retry for requests that carried
    // an authenticated user's token in the first place. login/register/
    // forgot-password calls never send X-User-Token, and must never
    // trigger this path -- a 401 there means "wrong credentials," not
    // "session expired."
    const isUserAuthenticated = "X-User-Token" in extraHeaders;
    const is401 = res.status === 401;

    if (isUserAuthenticated && is401 && !isRetry && this.sessionManager) {
      try {
        const newToken = await this.sessionManager.refreshIfNeeded();
        const retriedHeaders = { ...extraHeaders, "X-User-Token": newToken };
        // Exactly one retry -- isRetry=true this time, so a 401 on the
        // retried request itself falls straight through below rather
        // than looping.
        return this.request<TResponse>(method, path, body, retriedHeaders, true);
      } catch {
        // Refresh failed -- fall through and surface the ORIGINAL 401,
        // not a confusing "refresh also failed" error at this call site.
      }
    }

    throw new SentinelAuthError(
      parsed.error?.message ?? "Request failed",
      parsed.error?.code ?? "UNKNOWN_ERR",
      res.status
    );
  }

  async post<TResponse>(
    path: string,
    body: unknown,
    extraHeaders: Record<string, string> = {}
  ): Promise<TResponse> {
    return this.request<TResponse>("POST", path, body, extraHeaders, false);
  }
  async get<TResponse>(
    path: string,
    extraHeaders: Record<string, string> = {}
  ): Promise<TResponse> {
    return this.request<TResponse>("GET", path, undefined, extraHeaders, false);
  }
}
