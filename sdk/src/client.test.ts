import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient, SentinelAuthError } from "./client.js";

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetchResponse(body: unknown, status = 200) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe("HttpClient", () => {
  const client = new HttpClient({
    apiUrl: "https://api.example.com",
    apiKey: "test-secret-key",
  });

  it("sends Authorization header with Bearer prefix", async () => {
    mockFetchResponse({ success: true, data: { ok: true } });

    await client.post("/test", { foo: "bar" });

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(options.headers.Authorization).toBe("Bearer test-secret-key");
  });

  it("strips trailing slash from apiUrl", async () => {
    const trailingSlashClient = new HttpClient({
      apiUrl: "https://api.example.com/",
      apiKey: "test-secret-key",
    });

    mockFetchResponse({ success: true, data: {} });
    await trailingSlashClient.post("/test", {});

    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.example.com/test");
  });

  it("returns data on success", async () => {
    mockFetchResponse({ success: true, data: { userId: "abc123" } });

    const result = await client.post<{ userId: string }>("/test", {});
    expect(result.userId).toBe("abc123");
  });

  it("throws SentinelAuthError on failure response", async () => {
    mockFetchResponse(
      {
        success: false,
        error: { message: "Invalid credentials", code: "AUTHENTICATION_ERROR" },
      },
      401
    );

    await expect(client.post("/test", {})).rejects.toThrow(SentinelAuthError);
  });

  it("error includes code and statusCode", async () => {
    mockFetchResponse(
      {
        success: false,
        error: { message: "Rate limited", code: "RATE_LIMITED" },
      },
      429
    );

    try {
      await client.post("/test", {});
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SentinelAuthError);
      expect((err as SentinelAuthError).code).toBe("RATE_LIMITED");
      expect((err as SentinelAuthError).statusCode).toBe(429);
    }
  });

  it("merges extra headers on post", async () => {
    mockFetchResponse({ success: true, data: {} });

    await client.post("/test", {}, { "X-User-Token": "jwt-here" });

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(options.headers["X-User-Token"]).toBe("jwt-here");
    expect(options.headers.Authorization).toBe("Bearer test-secret-key");
  });

  it("get sends no body", async () => {
    mockFetchResponse({ success: true, data: {} });

    await client.get("/test");

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(options.method).toBe("GET");
    expect(options.body).toBeUndefined();
  });
});
describe("HttpClient — 401 interception", () => {
  it("retries once with a fresh token when a user-token request 401s", async () => {
    const client = new HttpClient({
      apiUrl: "https://api.example.com",
      apiKey: "key",
    });
    const mockSessionManager = {
      refreshIfNeeded: vi.fn().mockResolvedValue("new-token"),
    };
    client.attachSessionManager(mockSessionManager as any);

    let callCount = 0;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            success: false,
            error: { message: "expired", code: "AUTHENTICATION_ERROR" },
          }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { ok: true } }),
      } as Response;
    });

    const result = await client.post(
      "/test",
      {},
      { "X-User-Token": "old-token" }
    );

    expect(callCount).toBe(2);
    expect(mockSessionManager.refreshIfNeeded).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true });
  });

  it("does NOT attempt refresh for a 401 on a request without X-User-Token", async () => {
    const client = new HttpClient({
      apiUrl: "https://api.example.com",
      apiKey: "key",
    });
    const mockSessionManager = { refreshIfNeeded: vi.fn() };
    client.attachSessionManager(mockSessionManager as any);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        error: {
          message: "Invalid email or password",
          code: "AUTHENTICATION_ERROR",
        },
      }),
    } as Response);

    await expect(client.post("/api/auth/login", {})).rejects.toThrow(
      SentinelAuthError
    );
    expect(mockSessionManager.refreshIfNeeded).not.toHaveBeenCalled();
  });

  it("surfaces the ORIGINAL 401 if the refresh attempt itself fails", async () => {
    const client = new HttpClient({
      apiUrl: "https://api.example.com",
      apiKey: "key",
    });
    const mockSessionManager = {
      refreshIfNeeded: vi.fn().mockRejectedValue(new Error("refresh dead")),
    };
    client.attachSessionManager(mockSessionManager as any);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        error: { message: "Session expired", code: "AUTHENTICATION_ERROR" },
      }),
    } as Response);

    await expect(
      client.post("/test", {}, { "X-User-Token": "old-token" })
    ).rejects.toMatchObject({ message: "Session expired" });
  });

  it("does not retry more than once even if the retried request also 401s", async () => {
    const client = new HttpClient({
      apiUrl: "https://api.example.com",
      apiKey: "key",
    });
    const mockSessionManager = {
      refreshIfNeeded: vi.fn().mockResolvedValue("new-token"),
    };
    client.attachSessionManager(mockSessionManager as any);

    let callCount = 0;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callCount++;
      return {
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: { message: "still expired", code: "AUTHENTICATION_ERROR" },
        }),
      } as Response;
    });

    await expect(
      client.post("/test", {}, { "X-User-Token": "old-token" })
    ).rejects.toThrow();

    expect(callCount).toBe(2); // original + exactly one retry, never more
    expect(mockSessionManager.refreshIfNeeded).toHaveBeenCalledTimes(1);
  });

  it("sends credentials: include on every request", async () => {
    const client = new HttpClient({
      apiUrl: "https://api.example.com",
      apiKey: "key",
    });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: {} }),
    } as Response);

    await client.get("/test");

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(options.credentials).toBe("include");
  });
});
