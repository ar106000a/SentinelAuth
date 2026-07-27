import { describe, it, expect, vi, beforeEach } from "vitest";
import "./register-flow.js";
import type { SentinelAuth } from "../index.js";

function createMockSdk(overrides: Partial<SentinelAuth> = {}): SentinelAuth {
  return {
    register: vi.fn(),
    verifyEmail: vi.fn(),
    ...overrides,
  } as unknown as SentinelAuth;
}

function submitRegister(el: any, email: string, password: string) {
  const registerEl = el.shadowRoot.querySelector("sentinel-auth-register");
  registerEl.shadowRoot.querySelector("#email").value = email;
  registerEl.shadowRoot.querySelector("#password").value = password;
  registerEl.shadowRoot.querySelector("#confirm-password").value = password;
  registerEl.shadowRoot
    .querySelector("form")
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function submitOtp(el: any, code: string) {
  const otpEl = el.shadowRoot.querySelector("sentinel-auth-otp");
  const inputs = Array.from(
    otpEl.shadowRoot.querySelectorAll("input.digit")
  ) as HTMLInputElement[];
  code.split("").forEach((digit, i) => {
    inputs[i].value = digit;
    inputs[i].dispatchEvent(new Event("input", { bubbles: true }));
  });
  otpEl.shadowRoot.querySelector("button").click();
}

async function tick() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("sentinel-auth-register-flow", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("shows register step by default", () => {
    const el = document.createElement("sentinel-auth-register-flow") as any;
    document.body.appendChild(el);

    expect(
      el.shadowRoot.querySelector(".register-step").classList.contains("active")
    ).toBe(true);
    expect(
      el.shadowRoot.querySelector(".verify-step").classList.contains("active")
    ).toBe(false);
  });

  it("switches to verify step on successful registration", async () => {
    const sdk = createMockSdk({
      register: vi.fn().mockResolvedValue({ message: "check your email" }),
    });

    const el = document.createElement("sentinel-auth-register-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submitRegister(el, "new@example.com", "SecurePass123");
    await tick();

    expect(
      el.shadowRoot.querySelector(".verify-step").classList.contains("active")
    ).toBe(true);
    expect(
      el.shadowRoot.querySelector(".register-step").classList.contains("active")
    ).toBe(false);
  });

  it("displays the registered email in the verify step heading", async () => {
    const sdk = createMockSdk({
      register: vi.fn().mockResolvedValue({ message: "check your email" }),
    });

    const el = document.createElement("sentinel-auth-register-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submitRegister(el, "new@example.com", "SecurePass123");
    await tick();

    expect(el.shadowRoot.querySelector(".verify-email").textContent).toBe(
      "new@example.com"
    );
  });

  it("calls verifyEmail with the carried email and submitted code", async () => {
    const mockVerify = vi.fn().mockResolvedValue({ message: "verified" });
    const sdk = createMockSdk({
      register: vi.fn().mockResolvedValue({ message: "check your email" }),
      verifyEmail: mockVerify,
    });

    const el = document.createElement("sentinel-auth-register-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submitRegister(el, "new@example.com", "SecurePass123");
    await tick();
    submitOtp(el, "123456");
    await tick();

    expect(mockVerify).toHaveBeenCalledWith("new@example.com", "123456");
  });

  it("dispatches sentinel-register-complete after successful verification", async () => {
    const sdk = createMockSdk({
      register: vi.fn().mockResolvedValue({ message: "check your email" }),
      verifyEmail: vi
        .fn()
        .mockResolvedValue({
          message: "Email verified successfully. You may now log in.",
        }),
    });

    const el = document.createElement("sentinel-auth-register-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    const completeHandler = vi.fn();
    el.addEventListener("sentinel-register-complete", completeHandler);

    submitRegister(el, "new@example.com", "SecurePass123");
    await tick();
    submitOtp(el, "123456");
    await tick();

    expect(completeHandler).toHaveBeenCalledTimes(1);
    expect(completeHandler.mock.calls[0][0].detail.email).toBe(
      "new@example.com"
    );
  });

  it("shows error on OTP widget and stays on verify step when verifyEmail rejects", async () => {
    const sdk = createMockSdk({
      register: vi.fn().mockResolvedValue({ message: "check your email" }),
      verifyEmail: vi
        .fn()
        .mockRejectedValue(new Error("Invalid verification code")),
    });

    const el = document.createElement("sentinel-auth-register-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submitRegister(el, "new@example.com", "SecurePass123");
    await tick();
    submitOtp(el, "000000");
    await tick();

    const otpEl = el.shadowRoot.querySelector("sentinel-auth-otp");
    expect(otpEl.shadowRoot.querySelector(".error-message").textContent).toBe(
      "Invalid verification code"
    );
    // Must NOT silently revert to the register step on a wrong code
    expect(
      el.shadowRoot.querySelector(".verify-step").classList.contains("active")
    ).toBe(true);
  });

  it("reset() returns to the register step and clears the pending email", async () => {
    const sdk = createMockSdk({
      register: vi.fn().mockResolvedValue({ message: "check your email" }),
    });

    const el = document.createElement("sentinel-auth-register-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submitRegister(el, "new@example.com", "SecurePass123");
    await tick();
    expect(
      el.shadowRoot.querySelector(".verify-step").classList.contains("active")
    ).toBe(true);

    el.reset();

    expect(
      el.shadowRoot.querySelector(".register-step").classList.contains("active")
    ).toBe(true);
    expect(
      el.shadowRoot.querySelector(".verify-step").classList.contains("active")
    ).toBe(false);
  });

  it("forwards SDK to the inner register component", async () => {
    const sdk = createMockSdk();
    const el = document.createElement("sentinel-auth-register-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    // If setSdk wasn't forwarded, submitting would show "not connected" instead of calling register
    submitRegister(el, "new@example.com", "SecurePass123");
    await tick();

    expect(sdk.register).toHaveBeenCalled();
  });
});
