export interface SentinelAuthConfig {
  apiUrl: string;
  publicKey: string; // the tenant's secretKey — used as Bearer token
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

  constructor(config: SentinelAuthConfig) {
    this.baseUrl = config.apiUrl.replace(/\/$/, ""); // strip trailing slash
    this.apiKey = config.publicKey;
  }

  async post<TResponse>(
    path: string,
    body: unknown,
    extraHeaders: Record<string, string> = {}
  ): Promise<TResponse> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });

    return this.handleResponse<TResponse>(res);
  }

  async get<TResponse>(
    path: string,
    extraHeaders: Record<string, string> = {}
  ): Promise<TResponse> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...extraHeaders,
      },
    });

    return this.handleResponse<TResponse>(res);
  }

  private async handleResponse<TResponse>(res: Response): Promise<TResponse> {
    const body = await res.json();

    if (!res.ok || body.success === false) {
      throw new SentinelAuthError(
        body.error?.message ?? "Request failed",
        body.error?.code ?? "UNKNOWN_ERROR",
        res.status
      );
    }

    return body.data as TResponse;
  }
}
