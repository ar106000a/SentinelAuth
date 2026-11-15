import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SentinelAuth } from "./index.js";
import { HttpClient } from "./client.js";
import { SessionManager, InMemoryStorage, computeStorageKey } from "./session-manager.js";

const originalFetch = global.fetch;

function createTestStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    removeItem: vi.fn(async (k: string) => {
      store.delete(k);
    }),
    raw: store,
  };
}

describe("SDK Storage Mode (tokenTransport: 'storage')", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockFetchJson(body: unknown, status = 200) {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response);
  }

  describe("1. Key namespacing and storage adapter", () => {
    it("computes key matching sentinel_rt_<sha16>", () => {
      const key = computeStorageKey("https://api.example.com", "test-api-key-12345");
      expect(key).toMatch(/^sentinel_rt_[a-f0-9]{16}$/);
    });

    it("uses in-memory fallback when localStorage is unavailable", () => {
      const storage = new InMemoryStorage();
      storage.setItem("test-key", "token-val");
      expect(storage.getItem("test-key")).toBe("token-val");
      storage.removeItem("test-key");
      expect(storage.getItem("test-key")).toBeNull();
    });

    it("persists refresh token in custom storage adapter on setRefreshToken", async () => {
      const mockStorage = createTestStorage();

      const sm = new SessionManager(
        { post: vi.fn(), get: vi.fn() } as any,
        {
          apiUrl: "https://api.example.com",
          apiKey: "test-api-key",
          tokenTransport: "storage",
          storage: mockStorage,
          onSessionExpired: vi.fn(),
        }
      );

      await sm.ready;
      await sm.setRefreshToken("rt-initial-123");

      expect(mockStorage.setItem).toHaveBeenCalledWith(
        expect.stringMatching(/^sentinel_rt_[a-f0-9]{16}$/),
        "rt-initial-123"
      );
    });
  });

  describe("2. Credentials header per transport", () => {
    it("sends credentials: 'omit' in storage mode", async () => {
      mockFetchJson({ success: true, data: { ok: true } });

      const client = new HttpClient({
        apiUrl: "https://api.example.com",
        apiKey: "test-key",
        tokenTransport: "storage",
      });

      await client.post("/test", { hello: "world" });

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(options.credentials).toBe("omit");
    });

    it("sends credentials: 'include' in cookie mode", async () => {
      mockFetchJson({ success: true, data: { ok: true } });

      const client = new HttpClient({
        apiUrl: "https://api.example.com",
        apiKey: "test-key",
        tokenTransport: "cookie",
      });

      await client.post("/test", { hello: "world" });

      const [, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(options.credentials).toBe("include");
    });
  });

  describe("3. Silent restore on construction (ready promise)", () => {
    it("silently restores session if refresh token is present in storage", async () => {
      const storageKey = computeStorageKey("https://api.example.com", "test-key");
      const mockStorage = createTestStorage({
        [storageKey]: "stored-rt-123",
      });

      // Mock refresh call triggered by silent restore
      mockFetchJson({
        success: true,
        data: {
          accessToken: "restored-access-token",
          refreshToken: "new-rt-456",
        },
      });

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        apiKey: "test-key",
        tokenTransport: "storage",
        storage: mockStorage,
      });

      await sdk.ready;

      expect(sdk.getAccessToken()).toBe("restored-access-token");
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        storageKey,
        "new-rt-456"
      );
    });

    it("clears storage and emits session-expired when silent restore fails", async () => {
      const storageKey = computeStorageKey("https://api.example.com", "test-key");
      const mockStorage = createTestStorage({
        [storageKey]: "expired-rt-123",
      });

      // Mock refresh failure
      mockFetchJson(
        {
          success: false,
          error: { message: "Invalid refresh token", code: "AUTHENTICATION_ERROR" },
        },
        401
      );

      const expiredHandler = vi.fn();
      const signedOutHandler = vi.fn();

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        apiKey: "test-key",
        tokenTransport: "storage",
        storage: mockStorage,
      });

      sdk.addEventListener("session-expired", expiredHandler);
      sdk.addEventListener("signed-out", signedOutHandler);

      await sdk.ready;

      expect(sdk.getAccessToken()).toBeNull();
      expect(mockStorage.removeItem).toHaveBeenCalled();
      expect(expiredHandler).toHaveBeenCalledTimes(1);
      expect(signedOutHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("4. Login & MFA contracts in storage mode", () => {
    it("stores refreshToken in storage and strips it from returned login result", async () => {
      const mockStorage = createTestStorage();

      mockFetchJson({
        success: true,
        data: {
          user: { id: "u-1", email: "user@test.com" },
          accessToken: "at-login-123",
          refreshToken: "rt-login-456",
        },
      });

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        apiKey: "test-key",
        tokenTransport: "storage",
        storage: mockStorage,
      });
      await sdk.ready;

      const result = await sdk.login("user@test.com", "Password!123");

      expect((result as any).accessToken).toBe("at-login-123");
      expect((result as any).refreshToken).toBeUndefined();
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        expect.stringMatching(/^sentinel_rt_/),
        "rt-login-456"
      );
    });

    it("throws CONFIGURATION_MISMATCH if server returns refreshToken when tokenTransport is cookie", async () => {
      mockFetchJson({
        success: true,
        data: {
          user: { id: "u-1", email: "user@test.com" },
          accessToken: "at-login-123",
          refreshToken: "unexpected-rt",
        },
      });

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        apiKey: "test-key",
        tokenTransport: "cookie",
      });
      await sdk.ready;

      await expect(sdk.login("user@test.com", "Password!123")).rejects.toThrow(
        /CONFIGURATION_MISMATCH/
      );
    });
  });

  describe("5. Refresh and 401 retry in storage mode", () => {
    it("sends refreshToken in JSON body on /api/auth/refresh", async () => {
      const storageKey = computeStorageKey("https://api.example.com", "test-key");
      const mockStorage = createTestStorage({
        [storageKey]: "current-rt-789",
      });

      // 1. Silent restore refresh
      mockFetchJson({
        success: true,
        data: {
          accessToken: "initial-at",
          refreshToken: "rotated-rt-1",
        },
      });

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        apiKey: "test-key",
        tokenTransport: "storage",
        storage: mockStorage,
      });
      await sdk.ready;

      // 2. Manual refresh
      mockFetchJson({
        success: true,
        data: {
          accessToken: "manual-at",
          refreshToken: "rotated-rt-2",
        },
      });

      const res = await sdk.refresh();

      expect(res.accessToken).toBe("manual-at");
      expect((res as any).refreshToken).toBeUndefined();

      const lastCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(lastCall[0]).toContain("/api/auth/refresh");
      expect(JSON.parse(lastCall[1].body)).toEqual({
        refreshToken: "rotated-rt-1",
      });
    });

    it("retries once after 401 and succeeds", async () => {
      const storageKey = computeStorageKey("https://api.example.com", "test-key");
      const mockStorage = createTestStorage({
        [storageKey]: "rt-before-call",
      });

      // 1. Silent restore
      mockFetchJson({
        success: true,
        data: {
          accessToken: "stale-at",
          refreshToken: "rt-active",
        },
      });

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        apiKey: "test-key",
        tokenTransport: "storage",
        storage: mockStorage,
      });
      await sdk.ready;

      // 2. Protected call returns 401
      mockFetchJson(
        {
          success: false,
          error: { message: "Unauthorized", code: "AUTHENTICATION_ERROR" },
        },
        401
      );

      // 3. Refresh succeeds
      mockFetchJson({
        success: true,
        data: {
          accessToken: "fresh-at",
          refreshToken: "new-rt",
        },
      });

      // 4. Retry succeeds
      mockFetchJson({
        success: true,
        data: { secretData: 42 },
      });

      const data = await (sdk as any).http.post(
        "/api/protected",
        {},
        { "X-User-Token": "stale-at" }
      );
      expect(data.secretData).toBe(42);
    });
  });

  describe("6. Logout in storage mode", () => {
    it("passes refreshToken in JSON body to /api/auth/logout and clears storage", async () => {
      const storageKey = computeStorageKey("https://api.example.com", "test-key");
      const mockStorage = createTestStorage({
        [storageKey]: "rt-for-logout",
      });

      // Silent restore
      mockFetchJson({
        success: true,
        data: {
          accessToken: "at-for-logout",
          refreshToken: "rt-active-logout",
        },
      });

      const sdk = new SentinelAuth({
        apiUrl: "https://api.example.com",
        apiKey: "test-key",
        tokenTransport: "storage",
        storage: mockStorage,
      });
      await sdk.ready;

      // Logout endpoint mock
      mockFetchJson({
        success: true,
        data: { message: "Logged out" },
      });

      const signedOutHandler = vi.fn();
      sdk.addEventListener("signed-out", signedOutHandler);

      await sdk.logout();

      expect(sdk.getAccessToken()).toBeNull();
      expect(mockStorage.removeItem).toHaveBeenCalled();
      expect(signedOutHandler).toHaveBeenCalledTimes(1);

      const logoutCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
      expect(logoutCall[0]).toContain("/api/auth/logout");
      expect(JSON.parse(logoutCall[1].body)).toEqual({
        refreshToken: "rt-active-logout",
      });
    });
  });

  describe("7. Cross-tab synchronization via BroadcastChannel", () => {
    it("synchronizes token rotation across tabs via BroadcastChannel", async () => {
      type MessageListener = (e: { data: any }) => void;
      const channels = new Map<string, Set<MessageListener>>();

      class MockBroadcastChannel {
        name: string;
        listener: MessageListener | null = null;
        constructor(name: string) {
          this.name = name;
          if (!channels.has(name)) channels.set(name, new Set());
        }
        set onmessage(fn: MessageListener) {
          if (this.listener) channels.get(this.name)?.delete(this.listener);
          this.listener = fn;
          if (fn) channels.get(this.name)?.add(fn);
        }
        postMessage(data: any) {
          const listeners = channels.get(this.name);
          if (listeners) {
            for (const l of listeners) {
              if (l !== this.listener) l({ data });
            }
          }
        }
        close() {
          if (this.listener) channels.get(this.name)?.delete(this.listener);
        }
      }

      (global as any).BroadcastChannel = MockBroadcastChannel;

      const storageKey = computeStorageKey("https://api.example.com", "test-api-key");
      const sharedStore = createTestStorage({
        [storageKey]: "rt-shared-1",
      });

      const initialMockPost = vi.fn().mockResolvedValue({
        accessToken: "initial-shared-at",
        refreshToken: "rt-shared-1",
      });

      const sm1 = new SessionManager(
        { post: initialMockPost, get: vi.fn() } as any,
        {
          apiUrl: "https://api.example.com",
          apiKey: "test-api-key",
          tokenTransport: "storage",
          storage: sharedStore,
          onSessionExpired: vi.fn(),
        }
      );

      const sm2 = new SessionManager(
        { post: initialMockPost, get: vi.fn() } as any,
        {
          apiUrl: "https://api.example.com",
          apiKey: "test-api-key",
          tokenTransport: "storage",
          storage: sharedStore,
          onSessionExpired: vi.fn(),
        }
      );

      await Promise.all([sm1.ready, sm2.ready]);

      // When sm1 refreshes:
      (sm1 as any).httpClient.post = vi.fn().mockResolvedValue({
        accessToken: "fresh-access-tab1",
        refreshToken: "rotated-refresh-tab1",
      });

      await sm1.refreshIfNeeded();

      expect(sm1.getAccessToken()).toBe("fresh-access-tab1");
      // sm2 received the broadcast and applied the new access token
      expect(sm2.getAccessToken()).toBe("fresh-access-tab1");

      delete (global as any).BroadcastChannel;
    });
  });
});
