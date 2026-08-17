import { describe, it, expect, vi, beforeEach } from "vitest";
import "./mfa-setup.js";
import type { SentinelAuth } from "../index.js";

function createMockSdk(overrides: Partial<SentinelAuth> = {}): SentinelAuth {
  return {
    setupMfa: vi.fn(),
    enableMfa: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue(null), // ADDED default null
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
  otpEl.shadowRoot.querySelector("button").click();
}

async function tick() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("sentinel-auth-mfa-setup", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("does not call setupMfa until start() is invoked", () => {
    const mockSetup = vi.fn();
    // ADDED: getAccessToken mock
    const sdk = createMockSdk({
      setupMfa: mockSetup,
      getAccessToken: vi.fn().mockReturnValue("token123"),
    });

    const el = document.createElement("sentinel-auth-mfa-setup") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // REMOVED: el.setAccessToken("token123");

    expect(mockSetup).not.toHaveBeenCalled();
  });

  it("start() calls setupMfa with the access token and renders QR + secret", async () => {
    // ADDED: getAccessToken mock
    const sdk = createMockSdk({
      setupMfa: vi.fn().mockResolvedValue({
        secret: "JBSWY3DPEHPK3PXP",
        qrCodeDataUri: "data:image/png;base64,abc123",
      }),
      getAccessToken: vi.fn().mockReturnValue("token123"),
    });

    const el = document.createElement("sentinel-auth-mfa-setup") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // REMOVED: el.setAccessToken("token123");
    await el.start();

    expect(sdk.setupMfa).toHaveBeenCalledWith("token123");
    expect(el.shadowRoot.querySelector(".qr-wrap img").src).toBe(
      "data:image/png;base64,abc123"
    );
    expect(el.shadowRoot.querySelector(".secret").textContent).toBe(
      "JBSWY3DPEHPK3PXP"
    );
  });

  it("shows an error if start() is called without an access token", async () => {
    const sdk = createMockSdk(); // defaults to returning null for getAccessToken
    const el = document.createElement("sentinel-auth-mfa-setup") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // no setAccessToken call

    await el.start();

    expect(el.shadowRoot.querySelector(".form-error").textContent).toContain(
      "not initialized"
    );
  });

  it("switches to the confirm step when continue is clicked", async () => {
    // ADDED: getAccessToken mock
    const sdk = createMockSdk({
      setupMfa: vi.fn().mockResolvedValue({
        secret: "SECRET",
        qrCodeDataUri: "data:image/png;base64,x",
      }),
      getAccessToken: vi.fn().mockReturnValue("token123"),
    });

    const el = document.createElement("sentinel-auth-mfa-setup") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // REMOVED: el.setAccessToken("token123");
    await el.start();

    el.shadowRoot.querySelector(".continue-btn").click();

    expect(
      el.shadowRoot.querySelector(".confirm-step").classList.contains("active")
    ).toBe(true);
    expect(
      el.shadowRoot.querySelector(".qr-step").classList.contains("active")
    ).toBe(false);
  });

  it("calls enableMfa with the access token and code, dispatches complete on success", async () => {
    const mockEnable = vi
      .fn()
      .mockResolvedValue({ message: "MFA enabled successfully" });
    // ADDED: getAccessToken mock
    const sdk = createMockSdk({
      setupMfa: vi.fn().mockResolvedValue({
        secret: "SECRET",
        qrCodeDataUri: "data:image/png;base64,x",
      }),
      enableMfa: mockEnable,
      getAccessToken: vi.fn().mockReturnValue("token123"),
    });

    const el = document.createElement("sentinel-auth-mfa-setup") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // REMOVED: el.setAccessToken("token123");
    await el.start();
    el.shadowRoot.querySelector(".continue-btn").click();

    const completeHandler = vi.fn();
    el.addEventListener("sentinel-mfa-setup-complete", completeHandler);

    fillOtp(el, "123456");
    await tick();

    expect(mockEnable).toHaveBeenCalledWith("token123", "123456");
    expect(completeHandler).toHaveBeenCalledTimes(1);
  });

  it("shows error on OTP widget and stays on confirm step when enableMfa rejects", async () => {
    // ADDED: getAccessToken mock
    const sdk = createMockSdk({
      setupMfa: vi.fn().mockResolvedValue({
        secret: "SECRET",
        qrCodeDataUri: "data:image/png;base64,x",
      }),
      enableMfa: vi
        .fn()
        .mockRejectedValue(new Error("Invalid authentication code")),
      getAccessToken: vi.fn().mockReturnValue("token123"),
    });

    const el = document.createElement("sentinel-auth-mfa-setup") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // REMOVED: el.setAccessToken("token123");
    await el.start();
    el.shadowRoot.querySelector(".continue-btn").click();

    fillOtp(el, "000000");
    await tick();

    const otpEl = el.shadowRoot.querySelector("sentinel-auth-otp");
    expect(otpEl.shadowRoot.querySelector(".error-message").textContent).toBe(
      "Invalid authentication code"
    );
    expect(
      el.shadowRoot.querySelector(".confirm-step").classList.contains("active")
    ).toBe(true);
  });

  it("reset() clears QR, secret, and returns to the qr step", async () => {
    // ADDED: getAccessToken mock
    const sdk = createMockSdk({
      setupMfa: vi.fn().mockResolvedValue({
        secret: "SECRET",
        qrCodeDataUri: "data:image/png;base64,x",
      }),
      getAccessToken: vi.fn().mockReturnValue("token123"),
    });

    const el = document.createElement("sentinel-auth-mfa-setup") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);
    // REMOVED: el.setAccessToken("token123");
    await el.start();
    el.shadowRoot.querySelector(".continue-btn").click();

    el.reset();

    expect(el.shadowRoot.querySelector(".secret").textContent).toBe("");
    expect(
      el.shadowRoot.querySelector(".qr-step").classList.contains("active")
    ).toBe(true);
  });
});
