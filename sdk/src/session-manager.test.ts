import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionManager } from "./session-manager.js";
import type { HttpClient } from "./client.js";

function createMockHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { post: vi.fn(), get: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe("SessionManager", () => {
  let onSessionExpired: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSessionExpired = vi.fn();
  });

  it("stores and returns the access token", () => {
    const sm = new SessionManager(createMockHttp(), onSessionExpired);
    sm.setAccessToken("abc123");
    expect(sm.getAccessToken()).toBe("abc123");
  });

  it("clearSession wipes the token", () => {
    const sm = new SessionManager(createMockHttp(), onSessionExpired);
    sm.setAccessToken("abc123");
    sm.clearSession();
    expect(sm.getAccessToken()).toBeNull();
  });

  // ── The single-flight guard — the most important test in this file ─────────

  it("five concurrent refreshIfNeeded() calls trigger exactly one HTTP request", async () => {
    let resolvePost!: (v: unknown) => void;
    const pending = new Promise((resolve) => {
      resolvePost = resolve;
    });
    const mockPost = vi.fn().mockReturnValue(pending);
    const sm = new SessionManager(
      createMockHttp({ post: mockPost }),
      onSessionExpired
    );

    const calls = [
      sm.refreshIfNeeded(),
      sm.refreshIfNeeded(),
      sm.refreshIfNeeded(),
      sm.refreshIfNeeded(),
      sm.refreshIfNeeded(),
    ];

    resolvePost({ accessToken: "new-token" });
    const results = await Promise.all(calls);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(results.every((t) => t === "new-token")).toBe(true);
  });

  it("a refresh call AFTER a prior one has completed triggers a NEW request, not the stale cached one", async () => {
    const mockPost = vi
      .fn()
      .mockResolvedValueOnce({ accessToken: "token-1" })
      .mockResolvedValueOnce({ accessToken: "token-2" });
    const sm = new SessionManager(
      createMockHttp({ post: mockPost }),
      onSessionExpired
    );

    const first = await sm.refreshIfNeeded();
    const second = await sm.refreshIfNeeded();

    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(first).toBe("token-1");
    expect(second).toBe("token-2");
  });

  it("updates the stored access token on successful refresh", async () => {
    const mockPost = vi.fn().mockResolvedValue({ accessToken: "fresh-token" });
    const sm = new SessionManager(
      createMockHttp({ post: mockPost }),
      onSessionExpired
    );

    await sm.refreshIfNeeded();

    expect(sm.getAccessToken()).toBe("fresh-token");
  });

  it("clears the token and calls onSessionExpired when refresh fails", async () => {
    const mockPost = vi
      .fn()
      .mockRejectedValue(new Error("Invalid or expired refresh token"));
    const sm = new SessionManager(
      createMockHttp({ post: mockPost }),
      onSessionExpired
    );
    sm.setAccessToken("stale-token");

    await expect(sm.refreshIfNeeded()).rejects.toThrow();

    expect(sm.getAccessToken()).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("calls POST /api/auth/refresh with no body — token comes from the cookie, not a param", async () => {
    const mockPost = vi.fn().mockResolvedValue({ accessToken: "t" });
    const sm = new SessionManager(
      createMockHttp({ post: mockPost }),
      onSessionExpired
    );

    await sm.refreshIfNeeded();

    expect(mockPost).toHaveBeenCalledWith("/api/auth/refresh", {});
  });
});
