import { describe, it, expect, vi, beforeEach } from "vitest";
import "./reset-password-form.js";
import type { SentinelAuth } from "../index.js";

function createMockSdk(overrides: Partial<SentinelAuth> = {}): SentinelAuth {
  return { resetPassword: vi.fn(), ...overrides } as unknown as SentinelAuth;
}

function fillOtp(el: any, code: string) {
  const otpEl = el.shadowRoot.querySelector("sentinel-auth-otp");
  const shadow = otpEl?.shadowRoot || otpEl;
  const inputs = Array.from(
    shadow.querySelectorAll("input.digit")
  ) as HTMLInputElement[];
  code.split("").forEach((digit, i) => {
    inputs[i].value = digit;
    inputs[i].dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function fillPasswords(el: any, password: string, confirm: string) {
  const pw = el.shadowRoot.querySelector("#rp-new-password");
  const cpw = el.shadowRoot.querySelector("#rp-confirm-password");
  pw.value = password;
  pw.dispatchEvent(new Event("input", { bubbles: true }));
  cpw.value = confirm;
  cpw.dispatchEvent(new Event("input", { bubbles: true }));
}

function clickReset(el: any) {
  el.shadowRoot.querySelector("button.primary").click();
}

async function tick() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("sentinel-auth-reset-password", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the OTP widget and both password fields", () => {
    const el = document.createElement("sentinel-auth-reset-password") as any;
    document.body.appendChild(el);

    expect(el.shadowRoot.querySelector("sentinel-auth-otp")).toBeTruthy();
    expect(el.shadowRoot.querySelector("#rp-new-password")).toBeTruthy();
    expect(el.shadowRoot.querySelector("#rp-confirm-password")).toBeTruthy();
  });

  it("reads the OTP code directly from the digit inputs, not only from the submit event", async () => {
    // Deliberately does NOT click otp-input's own (hidden) internal button —
    // simulates the realistic path where the user only ever clicks THIS
    // component's outer submit button.
    const mockReset = vi
      .fn()
      .mockResolvedValue({ message: "Password reset successfully." });
    const sdk = createMockSdk({ resetPassword: mockReset });

    const el = document.createElement("sentinel-auth-reset-password") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    el.setEmail("user@example.com");

    fillOtp(el, "123456");
    fillPasswords(el, "NewSecurePass123", "NewSecurePass123");
    clickReset(el);
    await tick();

    expect(mockReset).toHaveBeenCalledWith(
      "user@example.com",
      "123456",
      "NewSecurePass123"
    );
  });

  it("rejects submission if the OTP code is incomplete", async () => {
    const mockReset = vi.fn();
    const sdk = createMockSdk({ resetPassword: mockReset });

    const el = document.createElement("sentinel-auth-reset-password") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    el.setEmail("user@example.com");

    fillOtp(el, "123"); // only 3 digits
    fillPasswords(el, "NewSecurePass123", "NewSecurePass123");
    clickReset(el);
    await tick();

    expect(mockReset).not.toHaveBeenCalled();
    expect(el.shadowRoot.querySelector(".form-error").textContent).toContain(
      "6-digit code"
    );
  });

  it("rejects submission if passwords mismatch, and never calls the API", async () => {
    const mockReset = vi.fn();
    const sdk = createMockSdk({ resetPassword: mockReset });

    const el = document.createElement("sentinel-auth-reset-password") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    el.setEmail("user@example.com");

    fillOtp(el, "123456");
    fillPasswords(el, "NewSecurePass123", "Mismatch456");
    clickReset(el);
    await tick();

    expect(mockReset).not.toHaveBeenCalled();
    expect(
      el.shadowRoot
        .querySelector("#rp-confirm-password")
        .classList.contains("invalid")
    ).toBe(true);
  });

  it("dispatches sentinel-reset-password-success with the response message", async () => {
    const sdk = createMockSdk({
      resetPassword: vi.fn().mockResolvedValue({
        message:
          "Password reset successfully. Please log in with your new password.",
      }),
    });

    const el = document.createElement("sentinel-auth-reset-password") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    el.setEmail("user@example.com");

    const handler = vi.fn();
    el.addEventListener("sentinel-reset-password-success", handler);

    fillOtp(el, "123456");
    fillPasswords(el, "NewSecurePass123", "NewSecurePass123");
    clickReset(el);
    await tick();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.message).toContain(
      "reset successfully"
    );
  });

  it("shows error on both the form and the OTP widget when reset fails, e.g. invalid code", async () => {
    const sdk = createMockSdk({
      resetPassword: vi
        .fn()
        .mockRejectedValue(new Error("Invalid or expired reset code")),
    });

    const el = document.createElement("sentinel-auth-reset-password") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    el.setEmail("user@example.com");

    fillOtp(el, "000000");
    fillPasswords(el, "NewSecurePass123", "NewSecurePass123");
    clickReset(el);
    await tick();

    expect(el.shadowRoot.querySelector(".form-error").textContent).toBe(
      "Invalid or expired reset code"
    );

    const otpEl = el.shadowRoot.querySelector("sentinel-auth-otp");
    expect(otpEl.shadowRoot.querySelector(".error-message").textContent).toBe(
      "Invalid or expired reset code"
    );
  });

  it("requires setEmail to have been called before submission", async () => {
    const mockReset = vi.fn();
    const sdk = createMockSdk({ resetPassword: mockReset });

    const el = document.createElement("sentinel-auth-reset-password") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // Deliberately not calling setEmail

    fillOtp(el, "123456");
    fillPasswords(el, "NewSecurePass123", "NewSecurePass123");
    clickReset(el);
    await tick();

    expect(mockReset).not.toHaveBeenCalled();
    expect(el.shadowRoot.querySelector(".form-error").textContent).toContain(
      "not initialized"
    );
  });

  it("reset() clears code, both password fields, and email", async () => {
    const sdk = createMockSdk({
      resetPassword: vi.fn().mockResolvedValue({ message: "reset" }),
    });

    const el = document.createElement("sentinel-auth-reset-password") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    el.setEmail("user@example.com");

    fillOtp(el, "123456");
    fillPasswords(el, "NewSecurePass123", "NewSecurePass123");

    el.reset();

    const otpInputs = Array.from(
      el.shadowRoot
        .querySelector("sentinel-auth-otp")
        .shadowRoot.querySelectorAll("input.digit")
    ) as HTMLInputElement[];
    expect(otpInputs.every((i) => i.value === "")).toBe(true);
    expect(el.shadowRoot.querySelector("#rp-new-password").value).toBe("");
    expect(el.shadowRoot.querySelector("#rp-confirm-password").value).toBe("");

    // Calling submit after reset should fail on the missing email, proving it was cleared
    clickReset(el);
    await tick();
    expect(el.shadowRoot.querySelector(".form-error").textContent).toContain(
      "not initialized"
    );
  });
});
