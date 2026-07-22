import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("@fingerprintjs/fingerprintjs", () => ({
  default: {
    load: vi.fn(),
  },
}));
import { SentinelAuth } from "./index.js";
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { clearFingerprintCache } from "./fingerprint.js";

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
  clearFingerprintCache();
  vi.mocked(FingerprintJS.load).mockReset();
  vi.mocked(FingerprintJS.load).mockResolvedValue({
    get: vi.fn().mockResolvedValue({ visitorId: "default-test-fingerprint" }),
  });
});

afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetchResponse(body: unknown, status = 200) {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe("SentinelAuth", () => {
  it("throws if apiUrl is missing", () => {
    expect(() => new SentinelAuth({ apiUrl: "", publicKey: "key" })).toThrow(
      "apiUrl is required"
    );
  });

  it("throws if publicKey is missing", () => {
    expect(
      () =>
        new SentinelAuth({ apiUrl: "https://api.example.com", publicKey: "" })
    ).toThrow("publicKey is required");
  });

  it("register calls the correct endpoint", async () => {
    mockFetchResponse({ success: true, data: { message: "check your email" } });

    const sdk = new SentinelAuth({
      apiUrl: "https://api.example.com",
      publicKey: "key",
    });

    await sdk.register("user@example.com", "password123");

    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("https://api.example.com/api/auth/register");
    expect(JSON.parse(options.body)).toEqual({
      email: "user@example.com",
      password: "password123",
    });
  });

  it("login returns typed response", async () => {
    mockFetchResponse({
      success: true,
      data: {
        accessToken: "jwt",
        refreshToken: "rt",
        mfaRequired: false,
        userId: "u1",
      },
    });

    const sdk = new SentinelAuth({
      apiUrl: "https://api.example.com",
      publicKey: "key",
    });

    const result = await sdk.login("user@example.com", "password123");
    expect(result.mfaRequired).toBe(false);
  });

  it("logout sends X-User-Token header", async () => {
    mockFetchResponse({ success: true, data: { message: "logged out" } });

    const sdk = new SentinelAuth({
      apiUrl: "https://api.example.com",
      publicKey: "key",
    });

    await sdk.logout("some-jwt-token");

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(options.headers["X-User-Token"]).toBe("some-jwt-token");
  });
  it("login sends fingerprint in request body", async () => {
    vi.mocked(FingerprintJS.load).mockResolvedValueOnce({
      get: vi.fn().mockResolvedValue({ visitorId: "sdk-test-fingerprint" }),
    });

    mockFetchResponse({
      success: true,
      data: {
        accessToken: "jwt",
        refreshToken: "rt",
        mfaRequired: false,
        userId: "u1",
      },
    });

    const sdk = new SentinelAuth({
      apiUrl: "https://api.example.com",
      publicKey: "key",
    });
    await sdk.login("user@example.com", "password123");

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const body = JSON.parse(options.body);
    expect(body.fingerprint).toBe("sdk-test-fingerprint");
  });

  it("login sends null fingerprint if FingerprintJS fails", async () => {
    vi.mocked(FingerprintJS.load).mockRejectedValueOnce(new Error("blocked"));

    mockFetchResponse({
      success: true,
      data: {
        accessToken: "jwt",
        refreshToken: "rt",
        mfaRequired: false,
        userId: "u1",
      },
    });

    const sdk = new SentinelAuth({
      apiUrl: "https://api.example.com",
      publicKey: "key",
    });
    await sdk.login("user@example.com", "password123");

    const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const body = JSON.parse(options.body);
    expect(body.fingerprint).toBeNull();
  });
});
