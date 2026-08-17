// sdk/src/components/mfa-disable.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import "./mfa-disable.js";
import type { SentinelAuth } from "../index.js";

function createMockSdk(overrides: Partial<SentinelAuth> = {}): SentinelAuth {
  return {
    disableMfa: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue(null),
    ...overrides,
  } as unknown as SentinelAuth;
}

function fillOtp(el: any, code: string) {
  const otpEl = el.shadowRoot.querySelector("sentinel-auth-otp");
  const inputs = Array.from(
    otpEl.shadowRoot.querySelectorAll("input.digit")
  ) as HTMLInputElement[];
  code.split("").forEach((digit, i) => {
    inputs[i].value = digit;
    inputs[i].dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function fillPassword(el: any, password: string) {
  const pw = el.shadowRoot.querySelector("#mfad-password");
  pw.value = password;
  pw.dispatchEvent(new Event("input", { bubbles: true }));
}

function clickSubmit(el: any) {
  el.shadowRoot.querySelector("button.primary").click();
}

async function tick() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("sentinel-auth-mfa-disable", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  // ── Structure ──────────────────────────────────────────────────────────────

  it("renders a password field and the OTP widget, single screen, no step-swapping", () => {
    const el = document.createElement("sentinel-auth-mfa-disable") as any;
    document.body.appendChild(el);

    expect(el.shadowRoot.querySelector("#mfad-password")).toBeTruthy();
    expect(el.shadowRoot.querySelector("sentinel-auth-otp")).toBeTruthy();
    // No multi-step containers expected — this ticket explicitly rules that out
    expect(el.shadowRoot.querySelectorAll(".step").length).toBe(0);
  });

  // ── Guard conditions (fail loud, per ticket's non-functional requirements) ──

  it("shows a specific error if submitted without an SDK connected", async () => {
    const el = document.createElement("sentinel-auth-mfa-disable") as any;
    document.body.appendChild(el);
    // REMOVED: el.setAccessToken("token123");

    fillPassword(el, "CurrentPass123");
    fillOtp(el, "123456");
    clickSubmit(el);
    await tick();

    expect(el.shadowRoot.querySelector(".form-error").textContent).toContain(
      "not connected"
    );
  });

  it("shows a specific error if submitted without an access token", async () => {
    const sdk = createMockSdk(); // getAccessToken defaults to returning null
    const el = document.createElement("sentinel-auth-mfa-disable") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // deliberately no setAccessToken call

    fillPassword(el, "CurrentPass123");
    fillOtp(el, "123456");
    clickSubmit(el);
    await tick();

    expect(el.shadowRoot.querySelector(".form-error").textContent).toContain(
      "not initialized"
    );
    expect(sdk.disableMfa).not.toHaveBeenCalled();
  });

  // ── The Week 11 wrinkle, reapplied ───────────────────────────────────────────

  it("reads the OTP code from the digit inputs directly — works without clicking otp-input's own button", async () => {
    const mockDisable = vi
      .fn()
      .mockResolvedValue({ message: "MFA disabled successfully" });
    // ADDED: getAccessToken mock
    const sdk = createMockSdk({
      disableMfa: mockDisable,
      getAccessToken: vi.fn().mockReturnValue("token123"),
    });

    const el = document.createElement("sentinel-auth-mfa-disable") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // REMOVED: el.setAccessToken("token123");

    fillPassword(el, "CurrentPass123");
    fillOtp(el, "123456");
    clickSubmit(el); // never touches otp-input's internal button
    await tick();

    expect(mockDisable).toHaveBeenCalledWith(
      "token123",
      "CurrentPass123",
      "123456"
    );
  });

  it("blocks submission if the code is incomplete, never calls the API", async () => {
    const mockDisable = vi.fn();
    // ADDED: getAccessToken mock
    const sdk = createMockSdk({
      disableMfa: mockDisable,
      getAccessToken: vi.fn().mockReturnValue("token123"),
    });

    const el = document.createElement("sentinel-auth-mfa-disable") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // REMOVED: el.setAccessToken("token123");

    fillPassword(el, "CurrentPass123");
    fillOtp(el, "123"); // incomplete
    clickSubmit(el);
    await tick();

    expect(mockDisable).not.toHaveBeenCalled();
  });

  it("blocks submission if the password field is empty, never calls the API", async () => {
    const mockDisable = vi.fn();
    // ADDED: getAccessToken mock
    const sdk = createMockSdk({
      disableMfa: mockDisable,
      getAccessToken: vi.fn().mockReturnValue("token123"),
    });

    const el = document.createElement("sentinel-auth-mfa-disable") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // REMOVED: el.setAccessToken("token123");

    fillOtp(el, "123456");
    clickSubmit(el); // no password entered at all
    await tick();

    expect(mockDisable).not.toHaveBeenCalled();
  });

  // ── Success path ──────────────────────────────────────────────────────────

  it("dispatches sentinel-mfa-disable-complete on success", async () => {
    // ADDED: getAccessToken mock
    const sdk = createMockSdk({
      disableMfa: vi
        .fn()
        .mockResolvedValue({ message: "MFA disabled successfully" }),
      getAccessToken: vi.fn().mockReturnValue("token123"),
    });

    const el = document.createElement("sentinel-auth-mfa-disable") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // REMOVED: el.setAccessToken("token123");

    const completeHandler = vi.fn();
    el.addEventListener("sentinel-mfa-disable-complete", completeHandler);

    fillPassword(el, "CurrentPass123");
    fillOtp(el, "123456");
    clickSubmit(el);
    await tick();

    expect(completeHandler).toHaveBeenCalledTimes(1);
  });

  // ── Distinguishable failure modes (SENT-1142 requirement #6) ─────────────────

  it("surfaces a wrong-password error distinctly, per the API's separate AuthenticationError for password", async () => {
    // ADDED: getAccessToken mock
    const sdk = createMockSdk({
      disableMfa: vi.fn().mockRejectedValue(new Error("Invalid password!")),
      getAccessToken: vi.fn().mockReturnValue("token123"),
    });

    const el = document.createElement("sentinel-auth-mfa-disable") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // REMOVED: el.setAccessToken("token123");

    fillPassword(el, "WrongPassword");
    fillOtp(el, "123456");
    clickSubmit(el);
    await tick();

    // Password-specific error should be attributable to the password field,
    // not the OTP widget — this is the "tell the user which one was wrong" requirement
    expect(
      el.shadowRoot
        .querySelector("#mfad-password")
        .classList.contains("invalid")
    ).toBe(true);
    expect(el.shadowRoot.querySelector(".form-error").textContent).toBe(
      "Invalid password!"
    );
  });

  it("surfaces a wrong-code error distinctly, per the API's separate AuthenticationError for code", async () => {
    // ADDED: getAccessToken mock
    const sdk = createMockSdk({
      disableMfa: vi
        .fn()
        .mockRejectedValue(new Error("Invalid authentication code!")),
      getAccessToken: vi.fn().mockReturnValue("token123"),
    });

    const el = document.createElement("sentinel-auth-mfa-disable") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // REMOVED: el.setAccessToken("token123");

    fillPassword(el, "CurrentPass123");
    fillOtp(el, "000000");
    clickSubmit(el);
    await tick();

    // Code-specific error should route to the OTP widget's own error display,
    // not just a generic form-level message
    const otpEl = el.shadowRoot.querySelector("sentinel-auth-otp");
    expect(otpEl.shadowRoot.querySelector(".error-message").textContent).toBe(
      "Invalid authentication code!"
    );
  });

  it("dispatches sentinel-mfa-disable-error on failure, never sentinel-mfa-disable-complete", async () => {
    // ADDED: getAccessToken mock
    const sdk = createMockSdk({
      disableMfa: vi.fn().mockRejectedValue(new Error("Invalid password")),
      getAccessToken: vi.fn().mockReturnValue("token123"),
    });

    const el = document.createElement("sentinel-auth-mfa-disable") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // REMOVED: el.setAccessToken("token123");

    const completeHandler = vi.fn();
    const errorHandler = vi.fn();
    el.addEventListener("sentinel-mfa-disable-complete", completeHandler);
    el.addEventListener("sentinel-mfa-disable-error", errorHandler);

    fillPassword(el, "WrongPassword");
    fillOtp(el, "123456");
    clickSubmit(el);
    await tick();

    expect(completeHandler).not.toHaveBeenCalled();
    expect(errorHandler).toHaveBeenCalledTimes(1);
  });

  // ── Loading state ─────────────────────────────────────────────────────────

  it("disables the submit button and shows a loading label while in flight", async () => {
    let resolveDisable!: (v: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveDisable = resolve;
    });
    // ADDED: getAccessToken mock
    const sdk = createMockSdk({
      disableMfa: vi.fn().mockReturnValue(pending),
      getAccessToken: vi.fn().mockReturnValue("token123"),
    });

    const el = document.createElement("sentinel-auth-mfa-disable") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // REMOVED: el.setAccessToken("token123");

    fillPassword(el, "CurrentPass123");
    fillOtp(el, "123456");
    clickSubmit(el);
    await tick();

    const button = el.shadowRoot.querySelector("button.primary");
    expect(button.disabled).toBe(true);

    resolveDisable({ message: "MFA disabled successfully" });
    await tick();

    expect(button.disabled).toBe(false);
  });

  // ── reset() ───────────────────────────────────────────────────────────────

  it("reset() clears the password field, the OTP code, and any error state", async () => {
    // ADDED: getAccessToken mock
    const sdk = createMockSdk({
      disableMfa: vi.fn().mockRejectedValue(new Error("Invalid password")),
      getAccessToken: vi.fn().mockReturnValue("token123"),
    });

    const el = document.createElement("sentinel-auth-mfa-disable") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // REMOVED: el.setAccessToken("token123");

    fillPassword(el, "WrongPassword");
    fillOtp(el, "123456");
    clickSubmit(el);
    await tick();

    el.reset();

    expect(el.shadowRoot.querySelector("#mfad-password").value).toBe("");
    expect(el.shadowRoot.querySelector(".form-error").textContent).toBe("");

    const otpInputs = Array.from(
      el.shadowRoot
        .querySelector("sentinel-auth-otp")
        .shadowRoot.querySelectorAll("input.digit")
    ) as HTMLInputElement[];
    expect(otpInputs.every((i) => i.value === "")).toBe(true);
  });
});
