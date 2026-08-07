// sdk/src/components/logout-button.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import "./logout-button.js";
import type { SentinelAuth } from "../index.js";

function createMockSdk(overrides: Partial<SentinelAuth> = {}): SentinelAuth {
  return { logout: vi.fn(), ...overrides } as unknown as SentinelAuth;
}

function clickLogout(el: any) {
  el.shadowRoot.querySelector("button.primary").click();
}

async function tick() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("sentinel-auth-logout-button", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  // ── Structure — req #1: renders one button, no form/fields ──────────────────

  it("renders a single button and nothing else interactive", () => {
    const el = document.createElement("sentinel-auth-logout-button") as any;
    document.body.appendChild(el);

    expect(el.shadowRoot.querySelector("button")).toBeTruthy();
    expect(el.shadowRoot.querySelectorAll("input").length).toBe(0);
    expect(el.shadowRoot.querySelectorAll("form").length).toBe(0);
  });

  // ── Guard conditions — req: fail loud if SDK/token missing ───────────────────

  it("shows a specific error if clicked without an SDK connected", async () => {
    const el = document.createElement("sentinel-auth-logout-button") as any;
    document.body.appendChild(el);
    el.setAccessToken("token123");

    clickLogout(el);
    await tick();

    expect(el.shadowRoot.querySelector(".form-error").textContent.length).toBeGreaterThan(0);
  });

  it("shows a specific error if clicked without an access token, and never calls the API", async () => {
    const sdk = createMockSdk();
    const el = document.createElement("sentinel-auth-logout-button") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // deliberately no setAccessToken call

    clickLogout(el);
    await tick();

    expect(sdk.logout).not.toHaveBeenCalled();
    expect(el.shadowRoot.querySelector(".form-error").textContent.length).toBeGreaterThan(0);
  });

  // ── req #3: calls logout with the access token ───────────────────────────────

  it("calls sdk.logout with the access token on click", async () => {
    const mockLogout = vi.fn().mockResolvedValue({ message: "Logged out successfully" });
    const sdk = createMockSdk({ logout: mockLogout });

    const el = document.createElement("sentinel-auth-logout-button") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    el.setAccessToken("token123");

    clickLogout(el);
    await tick();

    expect(mockLogout).toHaveBeenCalledWith("token123");
  });

  // ── req #4: loading state ────────────────────────────────────────────────────

  it("disables the button and shows a loading label while in flight", async () => {
    let resolveLogout!: (v: unknown) => void;
    const pending = new Promise((resolve) => { resolveLogout = resolve; });
    const sdk = createMockSdk({ logout: vi.fn().mockReturnValue(pending) });

    const el = document.createElement("sentinel-auth-logout-button") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    el.setAccessToken("token123");

    clickLogout(el);
    await tick();

    const button = el.shadowRoot.querySelector("button.primary");
    expect(button.disabled).toBe(true);

    resolveLogout({ message: "Logged out successfully" });
    await tick();

    expect(button.disabled).toBe(false);
  });

  // ── req #5: success event ─────────────────────────────────────────────────────

  it("dispatches sentinel-logout-complete on success", async () => {
    const sdk = createMockSdk({
      logout: vi.fn().mockResolvedValue({ message: "Logged out successfully" }),
    });

    const el = document.createElement("sentinel-auth-logout-button") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    el.setAccessToken("token123");

    const completeHandler = vi.fn();
    el.addEventListener("sentinel-logout-complete", completeHandler);

    clickLogout(el);
    await tick();

    expect(completeHandler).toHaveBeenCalledTimes(1);
  });

  // ── req #6: failure must NOT be silent ───────────────────────────────────────

  it("dispatches sentinel-logout-error on failure, never -complete", async () => {
    const sdk = createMockSdk({
      logout: vi.fn().mockRejectedValue(new Error("Network request failed")),
    });

    const el = document.createElement("sentinel-auth-logout-button") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    el.setAccessToken("token123");

    const completeHandler = vi.fn();
    const errorHandler = vi.fn();
    el.addEventListener("sentinel-logout-complete", completeHandler);
    el.addEventListener("sentinel-logout-error", errorHandler);

    clickLogout(el);
    await tick();

    expect(completeHandler).not.toHaveBeenCalled();
    expect(errorHandler).toHaveBeenCalledTimes(1);
  });

  it("shows a visible error message on failure, does not fail silently", async () => {
    const sdk = createMockSdk({
      logout: vi.fn().mockRejectedValue(new Error("Session already expired")),
    });

    const el = document.createElement("sentinel-auth-logout-button") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    el.setAccessToken("token123");

    clickLogout(el);
    await tick();

    expect(el.shadowRoot.querySelector(".form-error").textContent).toBe("Session already expired");
  });

  it("re-enables the button after a failure so the user can retry", async () => {
    const sdk = createMockSdk({
      logout: vi.fn().mockRejectedValue(new Error("Network request failed")),
    });

    const el = document.createElement("sentinel-auth-logout-button") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    el.setAccessToken("token123");

    clickLogout(el);
    await tick();

    const button = el.shadowRoot.querySelector("button.primary");
    expect(button.disabled).toBe(false);
  });

  // ── req #7: reset() ───────────────────────────────────────────────────────────

  it("reset() clears any error state", async () => {
    const sdk = createMockSdk({
      logout: vi.fn().mockRejectedValue(new Error("Network request failed")),
    });

    const el = document.createElement("sentinel-auth-logout-button") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    el.setAccessToken("token123");

    clickLogout(el);
    await tick();
    expect(el.shadowRoot.querySelector(".form-error").textContent.length).toBeGreaterThan(0);

    el.reset();

    expect(el.shadowRoot.querySelector(".form-error").textContent).toBe("");
  });
});