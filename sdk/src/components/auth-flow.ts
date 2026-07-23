import type { SentinelAuth } from "../index.js";
import type { LoginResponse, MfaVerifyResponse } from "@sentinelauth/types";
import "./login-form.js";
import "./otp-input.js";
import type { SentinelAuthLoginElement } from "./login-form.js";
import type { SentinelAuthOtpElement } from "./otp-input.js";

const TEMPLATE = /* html */ `
<style>
  :host {
    display: block;
  }
  .step {
    display: none;
  }
  .step.active {
    display: block;
  }
  .mfa-heading {
    font-family: var(--sentinel-font-family, system-ui, -apple-system, sans-serif);
    color: var(--sentinel-text-color, #1f2937);
    font-size: 0.9375rem;
    margin: 0 0 1rem 0;
  }
</style>

<div class="step login-step active">
  <sentinel-auth-login></sentinel-auth-login>
</div>
<div class="step mfa-step">
  <p class="mfa-heading">Enter the 6-digit code from your authenticator app.</p>
  <sentinel-auth-otp></sentinel-auth-otp>
</div>
`;

export class SentinelAuthFlowElement extends HTMLElement {
  private sdk: SentinelAuth | null = null;
  private loginStep: HTMLElement;
  private mfaStep: HTMLElement;
  private loginEl: SentinelAuthLoginElement;
  private otpEl: SentinelAuthOtpElement;
  private currentSessionChallenge: string | null = null;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = TEMPLATE;

    this.loginStep = shadow.querySelector(".login-step")!;
    this.mfaStep = shadow.querySelector(".mfa-step")!;
    this.loginEl = shadow.querySelector("sentinel-auth-login")!;
    this.otpEl = shadow.querySelector("sentinel-auth-otp")!;

    this.loginEl.addEventListener("sentinel-login-success", this.handleLoginResult as EventListener);
    this.otpEl.addEventListener("sentinel-otp-submit", this.handleOtpSubmit as EventListener);
  }

  setSdk(sdk: SentinelAuth) {
    this.sdk = sdk;
    this.loginEl.setSdk(sdk);
  }

  private handleLoginResult = (e: CustomEvent<LoginResponse>) => {
    const result = e.detail;

    if (result.mfaRequired) {
      // Login succeeded but MFA challenge is required — swap to OTP step
      this.currentSessionChallenge = result.sessionChallenge;
      this.showStep("mfa");
      return;
    }

    // No MFA required — login is fully complete, bubble the final result up
    this.dispatchEvent(
      new CustomEvent<LoginResponse>("sentinel-auth-complete", {
        detail: result,
        bubbles: true,
        composed: true,
      })
    );
  };

  private handleOtpSubmit = async (e: Event) => {
    const { code } = (e as CustomEvent<{ code: string }>).detail;
    if (!this.sdk || !this.currentSessionChallenge) {
      this.otpEl.showError("Session expired. Please log in again.");
      this.showStep("login");
      return;
    }

    try {
      const result: MfaVerifyResponse = await this.sdk.verifyMfa(
        this.currentSessionChallenge,
        code
      );

      this.dispatchEvent(
        new CustomEvent<MfaVerifyResponse>("sentinel-auth-complete", {
          detail: result,
          bubbles: true,
          composed: true,
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verification failed";
      this.otpEl.showError(message);
    } finally {
      this.otpEl.finishSubmitting();
    }
  };

  private showStep(step: "login" | "mfa") {
    this.loginStep.classList.toggle("active", step === "login");
    this.mfaStep.classList.toggle("active", step === "mfa");

    if (step === "mfa") {
      // Give focus to the first OTP box for immediate typing
      const firstInput = this.otpEl.shadowRoot?.querySelector("input.digit") as HTMLInputElement | null;
      firstInput?.focus();
    }
  }

  /** Resets the whole flow back to the login step — useful if a tenant wants a "start over" affordance. */
  reset() {
    this.currentSessionChallenge = null;
    this.otpEl.reset();
    this.showStep("login");
  }
}

customElements.define("sentinel-auth-flow", SentinelAuthFlowElement);