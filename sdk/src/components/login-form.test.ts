import { describe, it, expect, vi, beforeEach } from "vitest";
import "./login-form.js"; // registers the custom element
import type { SentinelAuth } from "../index.js";

function createMockSdk(overrides: Partial<SentinelAuth> = {}): SentinelAuth {
  return {
    login: vi.fn(),
    ...overrides,
  } as unknown as SentinelAuth;
}

describe("sentinel-auth-login", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders email and password fields", () => {
    const el = document.createElement("sentinel-auth-login") as any;
    document.body.appendChild(el);

    const emailInput = el.shadowRoot.querySelector('input[name="email"]');
    const passwordInput = el.shadowRoot.querySelector('input[name="password"]');

    expect(emailInput).toBeTruthy();
    expect(passwordInput).toBeTruthy();
  });

  it("shows an error if SDK is not connected before submit", async () => {
    const el = document.createElement("sentinel-auth-login") as any;
    document.body.appendChild(el);

    const form = el.shadowRoot.querySelector("form");
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );

    await new Promise((r) => setTimeout(r, 0));

    const errorEl = el.shadowRoot.querySelector(".error");
    expect(errorEl.textContent).toContain("not connected");
  });

  it("calls sdk.login with form values on submit", async () => {
    const mockLogin = vi.fn().mockResolvedValue({
      accessToken: "jwt",
      refreshToken: "rt",
      mfaRequired: false,
      userId: "u1",
    });
    const sdk = createMockSdk({ login: mockLogin });

    const el = document.createElement("sentinel-auth-login") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    const emailInput = el.shadowRoot.querySelector('input[name="email"]');
    const passwordInput = el.shadowRoot.querySelector('input[name="password"]');
    emailInput.value = "user@example.com";
    passwordInput.value = "password123";

    const form = el.shadowRoot.querySelector("form");
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );

    await new Promise((r) => setTimeout(r, 0));

    expect(mockLogin).toHaveBeenCalledWith("user@example.com", "password123");
  });

  it("dispatches sentinel-login-success event on success", async () => {
    const sdk = createMockSdk({
      login: vi.fn().mockResolvedValue({
        accessToken: "jwt",
        refreshToken: "rt",
        mfaRequired: false,
        userId: "u1",
      }),
    });

    const el = document.createElement("sentinel-auth-login") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    const successHandler = vi.fn();
    el.addEventListener("sentinel-login-success", successHandler);

    const emailInput = el.shadowRoot.querySelector('input[name="email"]');
    const passwordInput = el.shadowRoot.querySelector('input[name="password"]');
    emailInput.value = "user@example.com";
    passwordInput.value = "password123";

    el.shadowRoot
      .querySelector("form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await new Promise((r) => setTimeout(r, 0));

    expect(successHandler).toHaveBeenCalledTimes(1);
    expect(successHandler.mock.calls[0][0].detail.userId).toBe("u1");
  });

  it("dispatches sentinel-login-error event and shows message on failure", async () => {
    const sdk = createMockSdk({
      login: vi.fn().mockRejectedValue(new Error("Invalid email or password")),
    });

    const el = document.createElement("sentinel-auth-login") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    const errorHandler = vi.fn();
    el.addEventListener("sentinel-login-error", errorHandler);

    el.shadowRoot.querySelector('input[name="email"]').value =
      "user@example.com";
    el.shadowRoot.querySelector('input[name="password"]').value = "wrong";
    el.shadowRoot
      .querySelector("form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await new Promise((r) => setTimeout(r, 0));

    expect(errorHandler).toHaveBeenCalledTimes(1);
    const errorEl = el.shadowRoot.querySelector(".error");
    expect(errorEl.textContent).toBe("Invalid email or password");
  });

  it("disables submit button while request is in flight", async () => {
    let resolveLogin!: (v: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveLogin = resolve;
    });

    const sdk = createMockSdk({ login: vi.fn().mockReturnValue(pending) });

    const el = document.createElement("sentinel-auth-login") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    el.shadowRoot.querySelector('input[name="email"]').value =
      "user@example.com";
    el.shadowRoot.querySelector('input[name="password"]').value = "password123";
    el.shadowRoot
      .querySelector("form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

    await new Promise((r) => setTimeout(r, 0));

    const button = el.shadowRoot.querySelector("button");
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Signing in...");

    resolveLogin({
      accessToken: "jwt",
      refreshToken: "rt",
      mfaRequired: false,
      userId: "u1",
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(button.disabled).toBe(false);
  });

  it("respects a custom --sentinel-primary-color CSS variable", () => {
    const el = document.createElement("sentinel-auth-login") as any;
    el.style.setProperty("--sentinel-primary-color", "#ff0000");
    document.body.appendChild(el);

    const computed = getComputedStyle(el);
    expect(computed.getPropertyValue("--sentinel-primary-color").trim()).toBe(
      "#ff0000"
    );
  });
});
