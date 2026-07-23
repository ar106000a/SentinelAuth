import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("@fingerprintjs/fingerprintjs", () => ({
  default: {
    load: vi.fn(),
  },
}));
import { SentinelAuth, SentinelAuthError } from "./index.js";
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

  describe("password reset", () => {
    it("forgotPassword calls the correct endpoint", async () => {
      mockFetchResponse({
        success: true,
        data: {
          message: "If this email is registered, a reset code has been sent.",
        },
      });

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        publicKey: "key",
      });
      const result = await sdk.forgotPassword("user@example.com");

      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(url).toBe("https://api.example.com/api/auth/forgot-password");
      expect(JSON.parse(options.body)).toEqual({ email: "user@example.com" });
      expect(result.message).toContain("reset code");
    });

    it("resetPassword sends email, otp, and newPassword", async () => {
      mockFetchResponse({
        success: true,
        data: {
          message:
            "Password reset successfully. Please log in with your new password.",
        },
      });

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        publicKey: "key",
      });
      await sdk.resetPassword("user@example.com", "123456", "NewPassword!123");

      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(url).toBe("https://api.example.com/api/auth/reset-password");
      expect(JSON.parse(options.body)).toEqual({
        email: "user@example.com",
        otp: "123456",
        newPassword: "NewPassword!123",
      });
    });

    it("resetPassword propagates SentinelAuthError on invalid OTP", async () => {
      mockFetchResponse(
        {
          success: false,
          error: {
            message: "Invalid or expired reset code",
            code: "AUTHENTICATION_ERROR",
          },
        },
        401
      );

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        publicKey: "key",
      });

      await expect(
        sdk.resetPassword("user@example.com", "000000", "NewPassword!123")
      ).rejects.toThrow(SentinelAuthError);
    });
  });

  describe("MFA management", () => {
    it("setupMfa sends X-User-Token and returns secret + QR code", async () => {
      mockFetchResponse({
        success: true,
        data: {
          secret: "JBSWY3DPEHPK3PXP",
          qrCodeDataUri: "data:image/png;base64,abc",
        },
      });

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        publicKey: "key",
      });
      const result = await sdk.setupMfa("some-access-token");

      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(url).toBe("https://api.example.com/api/auth/mfa/setup");
      expect(options.headers["X-User-Token"]).toBe("some-access-token");
      expect(result.secret).toBe("JBSWY3DPEHPK3PXP");
    });

    it("enableMfa sends code and X-User-Token", async () => {
      mockFetchResponse({
        success: true,
        data: { message: "MFA enabled successfully" },
      });

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        publicKey: "key",
      });
      await sdk.enableMfa("some-access-token", "123456");

      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(url).toBe("https://api.example.com/api/auth/mfa/enable");
      expect(options.headers["X-User-Token"]).toBe("some-access-token");
      expect(JSON.parse(options.body)).toEqual({ code: "123456" });
    });

    it("disableMfa sends password, code, and X-User-Token", async () => {
      mockFetchResponse({
        success: true,
        data: { message: "MFA disabled successfully" },
      });

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        publicKey: "key",
      });
      await sdk.disableMfa("some-access-token", "MyPassword!123", "123456");

      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(url).toBe("https://api.example.com/api/auth/mfa/disable");
      expect(options.headers["X-User-Token"]).toBe("some-access-token");
      expect(JSON.parse(options.body)).toEqual({
        password: "MyPassword!123",
        code: "123456",
      });
    });

    it("disableMfa propagates error on wrong password", async () => {
      mockFetchResponse(
        {
          success: false,
          error: { message: "Invalid password", code: "AUTHENTICATION_ERROR" },
        },
        401
      );

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        publicKey: "key",
      });

      await expect(
        sdk.disableMfa("token", "WrongPassword", "123456")
      ).rejects.toThrow(SentinelAuthError);
    });
  });

  describe("MFA login challenge completion", () => {
    it("verifyMfa sends sessionChallenge and code WITHOUT an X-User-Token", async () => {
      mockFetchResponse({
        success: true,
        data: { accessToken: "jwt", refreshToken: "rt", userId: "u1" },
      });

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        publicKey: "key",
      });
      const result = await sdk.verifyMfa("a".repeat(64), "123456");

      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
        .calls[0];
      expect(url).toBe("https://api.example.com/api/auth/mfa/verify");
      expect(JSON.parse(options.body)).toEqual({
        sessionChallenge: "a".repeat(64),
        code: "123456",
      });
      // Deliberately no X-User-Token — the user isn't authenticated yet at this point
      expect(options.headers["X-User-Token"]).toBeUndefined();
      expect(result.accessToken).toBe("jwt");
    });

    it("verifyMfa propagates error on invalid code", async () => {
      mockFetchResponse(
        {
          success: false,
          error: {
            message: "Invalid authentication code",
            code: "AUTHENTICATION_ERROR",
          },
        },
        401
      );

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        publicKey: "key",
      });

      await expect(sdk.verifyMfa("a".repeat(64), "000000")).rejects.toThrow(
        SentinelAuthError
      );
    });

    it("verifyMfa propagates error on reused session challenge", async () => {
      mockFetchResponse(
        {
          success: false,
          error: {
            message: "Session challenge already used",
            code: "AUTHENTICATION_ERROR",
          },
        },
        401
      );

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        publicKey: "key",
      });

      await expect(sdk.verifyMfa("a".repeat(64), "123456")).rejects.toThrow(
        SentinelAuthError
      );
    });
  });
});
