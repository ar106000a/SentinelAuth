import type { SentinelAuth } from "../index.js";
import "./otp-input.js";
import type { SentinelAuthOtpElement } from "./otp-input.js";

const TEMPLATE = /* html */ `
<style>
  :host {
    display: block;
    font-family: var(--sentinel-font-family, system-ui, -apple-system, sans-serif);
    --_primary: var(--sentinel-primary-color, #2563eb);
    --_primary-hover: var(--sentinel-primary-hover-color, #1d4ed8);
    --_error: var(--sentinel-error-color, #dc2626);
    --_text: var(--sentinel-text-color, #1f2937);
    --_muted: var(--sentinel-muted-text-color, #6b7280);
    --_border: var(--sentinel-border-color, #d1d5db);
    --_bg: var(--sentinel-background-color, #ffffff);
    --_radius: var(--sentinel-border-radius, 8px);
    --_spacing: var(--sentinel-spacing, 1rem);
  }

  .container {
    display: flex;
    flex-direction: column;
    gap: var(--_spacing);
    background: var(--_bg);
    padding: var(--sentinel-padding, 1.5rem);
    border-radius: var(--_radius);
    max-width: var(--sentinel-max-width, 360px);
  }

  .step { display: none; }
  .step.active { display: flex; flex-direction: column; gap: var(--_spacing); }

  .qr-wrap {
    display: flex;
    justify-content: center;
    padding: 1rem;
    background: var(--sentinel-qr-background, #ffffff);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
  }

  .qr-wrap img {
    width: var(--sentinel-qr-size, 180px);
    height: var(--sentinel-qr-size, 180px);
    image-rendering: pixelated;
  }

  .secret {
    font-family: ui-monospace, monospace;
    font-size: 0.8125rem;
    color: var(--_muted);
    background: var(--sentinel-secret-background, #f3f4f6);
    padding: 0.5rem 0.75rem;
    border-radius: var(--_radius);
    word-break: break-all;
    text-align: center;
  }

  p.instructions {
    font-size: 0.875rem;
    color: var(--_muted);
    margin: 0;
  }

  button.primary {
    background: var(--_primary);
    color: var(--sentinel-button-text-color, #ffffff);
    border: none;
    padding: 0.625rem 1rem;
    border-radius: var(--_radius);
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
  }

  button.primary:hover:not(:disabled) { background: var(--_primary-hover); }
  button.primary:disabled { opacity: 0.6; cursor: not-allowed; }

  .form-error { color: var(--_error); font-size: 0.875rem; min-height: 1.25rem; }
</style>

<div class="container">
  <div class="step qr-step active">
    <p class="instructions">Scan this code with your authenticator app, then continue.</p>
    <div class="qr-wrap"><img alt="MFA setup QR code" /></div>
    <p class="instructions">Or enter this code manually:</p>
    <div class="secret"></div>
    <button type="button" class="primary continue-btn">I've added it — continue</button>
  </div>

  <div class="step confirm-step">
    <p class="instructions">Enter the 6-digit code from your authenticator app to confirm setup.</p>
    <sentinel-auth-otp></sentinel-auth-otp>
  </div>

  <div class="form-error" role="alert"></div>
</div>
`;

export class SentinelAuthMfaSetupElement extends HTMLElement {
  private sdk: SentinelAuth | null = null;
  private accessToken: string | null = null;
  private qrStep: HTMLElement;
  private confirmStep: HTMLElement;
  private qrImg: HTMLImageElement;
  private secretEl: HTMLElement;
  private continueBtn: HTMLButtonElement;
  private otpEl: SentinelAuthOtpElement;
  private errorEl: HTMLElement;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = TEMPLATE;

    this.qrStep = shadow.querySelector(".qr-step")!;
    this.confirmStep = shadow.querySelector(".confirm-step")!;
    this.qrImg = shadow.querySelector(".qr-wrap img")!;
    this.secretEl = shadow.querySelector(".secret")!;
    this.continueBtn = shadow.querySelector(".continue-btn")!;
    this.otpEl = shadow.querySelector("sentinel-auth-otp")!;
    this.errorEl = shadow.querySelector(".form-error")!;

    this.continueBtn.addEventListener("click", () => this.showStep("confirm"));
    this.otpEl.addEventListener("sentinel-otp-submit", this.handleConfirm as EventListener);
  }

  setSdk(sdk: SentinelAuth) {
    this.sdk = sdk;
  }

  /** Must be called with a valid access token before start(). */
  setAccessToken(token: string) {
    this.accessToken = token;
  }

  /**
   * Triggers setupMfa() and populates the QR code + secret.
   * Not called automatically from connectedCallback — the caller decides
   * when setup begins (e.g. a settings page button), since hitting the
   * API the instant this element is created would be surprising and
   * would also fail before setAccessToken() has necessarily run.
   */
  async start() {
    this.errorEl.textContent = "";

    if (!this.sdk || !this.accessToken) {
      this.errorEl.textContent = "MFA setup not initialized — missing SDK or access token.";
      return;
    }

    try {
      const result = await this.sdk.setupMfa(this.accessToken);
      this.qrImg.src = result.qrCodeDataUri;
      this.secretEl.textContent = result.secret;
      this.showStep("qr");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start MFA setup";
      this.errorEl.textContent = message;
    }
  }

  private handleConfirm = async (e: Event) => {
    const {code} = (e as CustomEvent<{ code: string }>).detail;
    this.errorEl.textContent = "";

    if (!this.sdk || !this.accessToken) {
      this.otpEl.showError("MFA setup session expired. Please start over.");
      return;
    }

    try {
      await this.sdk.enableMfa(this.accessToken, code);

      this.dispatchEvent(
        new CustomEvent("sentinel-mfa-setup-complete", {
          bubbles: true,
          composed: true,
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid code";
      this.otpEl.showError(message);
    } finally {
      this.otpEl.finishSubmitting();
    }
  };

  private showStep(step: "qr" | "confirm") {
    this.qrStep.classList.toggle("active", step === "qr");
    this.confirmStep.classList.toggle("active", step === "confirm");

    if (step === "confirm") {
      const firstInput = this.otpEl.shadowRoot?.querySelector("input.digit") as HTMLInputElement | null;
      firstInput?.focus();
    }
  }

  reset() {
    this.otpEl.reset();
    this.qrImg.src = "";
    this.secretEl.textContent = "";
    this.errorEl.textContent = "";
    this.showStep("qr");
  }
}

customElements.define("sentinel-auth-mfa-setup", SentinelAuthMfaSetupElement);