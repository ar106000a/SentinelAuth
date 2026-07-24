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
