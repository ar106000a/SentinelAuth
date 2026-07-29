import { describe, it, expect, vi, beforeEach } from "vitest";
import "./password-reset-flow.js";
import type { SentinelAuth } from "../index.js";

function createMockSdk(overrides: Partial<SentinelAuth> = {}): SentinelAuth {
  return {
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    ...overrides,
  } as unknown as SentinelAuth;
}

function submitForgotPassword(el: any, email: string) {
  const forgotEl = el.shadowRoot.querySelector("sentinel-auth-forgot-password");
  forgotEl.shadowRoot.querySelector("#fp-email").value = email;
  forgotEl.shadowRoot.querySelector("form")
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function submitReset(el: any, code: string, password: string) {
  const resetEl = el.shadowRoot.querySelector("sentinel-auth-reset-password");
  const otpEl = resetEl.shadowRoot.querySelector("sentinel-auth-otp");
  const inputs = Array.from(otpEl.shadowRoot.querySelectorAll("input.digit")) as HTMLInputElement[];
  code.split("").forEach((digit, i) => {
    inputs[i].value = digit;
    inputs[i].dispatchEvent(new Event("input", { bubbles: true }));
  });

  const pw = resetEl.shadowRoot.querySelector("#rp-new-password");
  const cpw = resetEl.shadowRoot.querySelector("#rp-confirm-password");
  pw.value = password;
  pw.dispatchEvent(new Event("input", { bubbles: true }));
  cpw.value = password;
  cpw.dispatchEvent(new Event("input", { bubbles: true }));

  resetEl.shadowRoot.querySelector("button.primary").click();
}

async function tick() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("sentinel-auth-password-reset-flow", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("shows the request step by default", () => {
    const el = document.createElement("sentinel-auth-password-reset-flow") as any;
    document.body.appendChild(el);

    expect(el.shadowRoot.querySelector(".request-step").classList.contains("active")).toBe(true);
    expect(el.shadowRoot.querySelector(".reset-step").classList.contains("active")).toBe(false);
  });

  it("forwards SDK to both inner components", () => {
    const sdk = createMockSdk();
    const el = document.createElement("sentinel-auth-password-reset-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submitForgotPassword(el, "user@example.com");

    // If setSdk wasn't forwarded to forgotEl, this would show "not connected" instead
    expect(sdk.forgotPassword).toHaveBeenCalled();
  });

  it("switches to the reset step after a request is sent", async () => {
    const sdk = createMockSdk({
      forgotPassword: vi.fn().mockResolvedValue({ message: "If this email is registered, a reset code has been sent." }),
    });

    const el = document.createElement("sentinel-auth-password-reset-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submitForgotPassword(el, "user@example.com");
    await tick();

    expect(el.shadowRoot.querySelector(".reset-step").classList.contains("active")).toBe(true);
    expect(el.shadowRoot.querySelector(".request-step").classList.contains("active")).toBe(false);
  });

  it("carries the email into the reset step so resetPassword is called with it", async () => {
    const mockReset = vi.fn().mockResolvedValue({ message: "reset ok" });
    const sdk = createMockSdk({
      forgotPassword: vi.fn().mockResolvedValue({ message: "sent" }),
      resetPassword: mockReset,
    });

    const el = document.createElement("sentinel-auth-password-reset-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submitForgotPassword(el, "carried@example.com");
    await tick();
    submitReset(el, "123456", "NewSecurePass123");
    await tick();

    expect(mockReset).toHaveBeenCalledWith("carried@example.com", "123456", "NewSecurePass123");
  });

  it("dispatches sentinel-password-reset-complete after successful reset", async () => {
    const sdk = createMockSdk({
      forgotPassword: vi.fn().mockResolvedValue({ message: "sent" }),
      resetPassword: vi.fn().mockResolvedValue({
        message: "Password reset successfully. Please log in with your new password.",
      }),
    });

    const el = document.createElement("sentinel-auth-password-reset-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    const completeHandler = vi.fn();
    el.addEventListener("sentinel-password-reset-complete", completeHandler);

    submitForgotPassword(el, "user@example.com");
    await tick();
    submitReset(el, "123456", "NewSecurePass123");
    await tick();

    expect(completeHandler).toHaveBeenCalledTimes(1);
    expect(completeHandler.mock.calls[0][0].detail.email).toBe("user@example.com");
    expect(completeHandler.mock.calls[0][0].detail.message).toContain("reset successfully");
  });

  it("stays on reset step and does not dispatch complete when resetPassword rejects", async () => {
    const sdk = createMockSdk({
      forgotPassword: vi.fn().mockResolvedValue({ message: "sent" }),
      resetPassword: vi.fn().mockRejectedValue(new Error("Invalid or expired reset code")),
    });

    const el = document.createElement("sentinel-auth-password-reset-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    const completeHandler = vi.fn();
    el.addEventListener("sentinel-password-reset-complete", completeHandler);

    submitForgotPassword(el, "user@example.com");
    await tick();
    submitReset(el, "000000", "NewSecurePass123");
    await tick();

    expect(completeHandler).not.toHaveBeenCalled();
    expect(el.shadowRoot.querySelector(".reset-step").classList.contains("active")).toBe(true);
  });

  it("reset() returns to the request step", async () => {
    const sdk = createMockSdk({
      forgotPassword: vi.fn().mockResolvedValue({ message: "sent" }),
    });

    const el = document.createElement("sentinel-auth-password-reset-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submitForgotPassword(el, "user@example.com");
    await tick();
    expect(el.shadowRoot.querySelector(".reset-step").classList.contains("active")).toBe(true);

    el.reset();

    expect(el.shadowRoot.querySelector(".request-step").classList.contains("active")).toBe(true);
    expect(el.shadowRoot.querySelector(".reset-step").classList.contains("active")).toBe(false);
  });
});