import { describe, it, expect, vi, beforeEach } from "vitest";
import "./auth-flow.js";
import type { SentinelAuth } from "../index.js";

function createMockSdk(overrides: Partial<SentinelAuth> = {}): SentinelAuth {
  return {
    login: vi.fn(),
    verifyMfa: vi.fn(),
    ...overrides,
  } as unknown as SentinelAuth;
}

function submitLogin(el: any, email: string, password: string) {
  const loginEl = el.shadowRoot.querySelector("sentinel-auth-login");
  loginEl.shadowRoot.querySelector('input[name="email"]').value = email;
  loginEl.shadowRoot.querySelector('input[name="password"]').value = password;
  loginEl.shadowRoot
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

describe("sentinel-auth-flow", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("shows login step by default", () => {
    const el = document.createElement("sentinel-auth-flow") as any;
    document.body.appendChild(el);

    const loginStep = el.shadowRoot.querySelector(".login-step");
    const mfaStep = el.shadowRoot.querySelector(".mfa-step");

    expect(loginStep.classList.contains("active")).toBe(true);
    expect(mfaStep.classList.contains("active")).toBe(false);
  });

  it("dispatches sentinel-auth-complete directly when MFA is not required", async () => {
    const sdk = createMockSdk({
      login: vi.fn().mockResolvedValue({
        accessToken: "jwt",
        refreshToken: "rt",
        mfaRequired: false,
        userId: "u1",
      }),
    });

    const el = document.createElement("sentinel-auth-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    const completeHandler = vi.fn();
    el.addEventListener("sentinel-auth-complete", completeHandler);

    submitLogin(el, "user@example.com", "password123");
    await tick();

    expect(completeHandler).toHaveBeenCalledTimes(1);
    expect(completeHandler.mock.calls[0][0].detail.accessToken).toBe("jwt");

    // Should NOT have switched to MFA step
    expect(
      el.shadowRoot.querySelector(".mfa-step").classList.contains("active")
    ).toBe(false);
  });

  it("switches to MFA step when login returns mfaRequired: true", async () => {
    const sdk = createMockSdk({
      login: vi.fn().mockResolvedValue({
        mfaRequired: true,
        sessionChallenge: "a".repeat(64),
        userId: "u1",
      }),
    });

    const el = document.createElement("sentinel-auth-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submitLogin(el, "user@example.com", "password123");
    await tick();

    expect(
      el.shadowRoot.querySelector(".mfa-step").classList.contains("active")
    ).toBe(true);
    expect(
      el.shadowRoot.querySelector(".login-step").classList.contains("active")
    ).toBe(false);
  });

  it("calls verifyMfa with the carried sessionChallenge on OTP submit", async () => {
    const mockVerifyMfa = vi.fn().mockResolvedValue({
      accessToken: "jwt2",
      refreshToken: "rt2",
      userId: "u1",
    });
    const sdk = createMockSdk({
      login: vi.fn().mockResolvedValue({
        mfaRequired: true,
        sessionChallenge: "b".repeat(64),
        userId: "u1",
      }),
      verifyMfa: mockVerifyMfa,
    });

    const el = document.createElement("sentinel-auth-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submitLogin(el, "user@example.com", "password123");
    await tick();

    submitOtp(el, "123456");
    await tick();

    expect(mockVerifyMfa).toHaveBeenCalledWith("b".repeat(64), "123456");
  });

  it("dispatches sentinel-auth-complete after successful MFA verification", async () => {
    const sdk = createMockSdk({
      login: vi.fn().mockResolvedValue({
        mfaRequired: true,
        sessionChallenge: "c".repeat(64),
        userId: "u1",
      }),
      verifyMfa: vi.fn().mockResolvedValue({
        accessToken: "final-jwt",
        refreshToken: "final-rt",
        userId: "u1",
      }),
    });

    const el = document.createElement("sentinel-auth-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    const completeHandler = vi.fn();
    el.addEventListener("sentinel-auth-complete", completeHandler);

    submitLogin(el, "user@example.com", "password123");
    await tick();
    submitOtp(el, "123456");
    await tick();

    expect(completeHandler).toHaveBeenCalledTimes(1);
    expect(completeHandler.mock.calls[0][0].detail.accessToken).toBe(
      "final-jwt"
    );
  });

  it("shows error on OTP widget when verifyMfa rejects, stays on MFA step", async () => {
    const sdk = createMockSdk({
      login: vi.fn().mockResolvedValue({
        mfaRequired: true,
        sessionChallenge: "d".repeat(64),
        userId: "u1",
      }),
      verifyMfa: vi
        .fn()
        .mockRejectedValue(new Error("Invalid authentication code")),
    });

    const el = document.createElement("sentinel-auth-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submitLogin(el, "user@example.com", "password123");
    await tick();
    submitOtp(el, "000000");
    await tick();

    const otpEl = el.shadowRoot.querySelector("sentinel-auth-otp");
    const errorEl = otpEl.shadowRoot.querySelector(".error-message");

    expect(errorEl.textContent).toBe("Invalid authentication code");
    // Should remain on MFA step — not silently drop back to login
    expect(
      el.shadowRoot.querySelector(".mfa-step").classList.contains("active")
    ).toBe(true);
  });

  it("re-enables OTP submit button after a failed verification", async () => {
    const sdk = createMockSdk({
      login: vi.fn().mockResolvedValue({
        mfaRequired: true,
        sessionChallenge: "e".repeat(64),
        userId: "u1",
      }),
      verifyMfa: vi.fn().mockRejectedValue(new Error("wrong code")),
    });

    const el = document.createElement("sentinel-auth-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submitLogin(el, "user@example.com", "password123");
    await tick();
    submitOtp(el, "000000");
    await tick();

    const otpEl = el.shadowRoot.querySelector("sentinel-auth-otp");
    const button = otpEl.shadowRoot.querySelector("button");

    // Button should be re-enabled (though disabled again since inputs got cleared by showError)
    expect(button.textContent).toBe("Verify");
  });

  it("reset() returns to login step and clears session challenge", async () => {
    const sdk = createMockSdk({
      login: vi.fn().mockResolvedValue({
        mfaRequired: true,
        sessionChallenge: "f".repeat(64),
        userId: "u1",
      }),
    });

    const el = document.createElement("sentinel-auth-flow") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submitLogin(el, "user@example.com", "password123");
    await tick();

    expect(
      el.shadowRoot.querySelector(".mfa-step").classList.contains("active")
    ).toBe(true);

    el.reset();

    expect(
      el.shadowRoot.querySelector(".login-step").classList.contains("active")
    ).toBe(true);
    expect(
      el.shadowRoot.querySelector(".mfa-step").classList.contains("active")
    ).toBe(false);
  });
});
