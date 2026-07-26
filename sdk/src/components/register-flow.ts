import type { SentinelAuth } from "../index.js";
import type { UserVerifyEmailResponse } from "@sentinelauth/types";
import "./register-form.js";
import "./otp-input.js";
import type { SentinelAuthRegisterElement } from "./register-form.js";
import type { SentinelAuthOtpElement } from "./otp-input.js";

const TEMPLATE = /* html */ `
<style>
  :host { display: block; }
  .step { display: none; }
  .step.active { display: block; }
  .verify-heading {
    font-family: var(--sentinel-font-family, system-ui, -apple-system, sans-serif);
    color: var(--sentinel-text-color, #1f2937);
    font-size: 0.9375rem;
    margin: 0 0 1rem 0;
  }
  .verify-heading strong { font-weight: 600; }
</style>

<div class="step register-step active">
  <sentinel-auth-register></sentinel-auth-register>
</div>
<div class="step verify-step">
  <p class="verify-heading">We sent a code to <strong class="verify-email"></strong>. Enter it below.</p>
  <sentinel-auth-otp></sentinel-auth-otp>
</div>
`;

export class SentinelAuthRegisterFlowElement extends HTMLElement {
  private sdk: SentinelAuth | null = null;
  private registerStep: HTMLElement;
  private verifyStep: HTMLElement;
  private registerEl: SentinelAuthRegisterElement;
  private otpEl: SentinelAuthOtpElement;
  private emailLabel: HTMLElement;
  private pendingEmail: string | null = null;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = TEMPLATE;

    this.registerStep = shadow.querySelector(".register-step")!;
    this.verifyStep = shadow.querySelector(".verify-step")!;
    this.registerEl = shadow.querySelector("sentinel-auth-register")!;
    this.otpEl = shadow.querySelector("sentinel-auth-otp")!;
    this.emailLabel = shadow.querySelector(".verify-email")!;

    this.registerEl.addEventListener(
      "sentinel-register-success",
      this.handleRegisterSuccess as EventListener
    );
    this.otpEl.addEventListener(
      "sentinel-otp-submit",
      this.handleOtpSubmit as EventListener
    );
  }

  setSdk(sdk: SentinelAuth) {
    this.sdk = sdk;
    this.registerEl.setSdk(sdk);
  }

  private handleRegisterSuccess = (e: CustomEvent<{ email: string }>) => {
    this.pendingEmail = e.detail.email;
    this.emailLabel.textContent = e.detail.email;
    this.showStep("verify");
  };

  private handleOtpSubmit = async (e: Event) => {
    const { code } = (e as CustomEvent<{ code: string }>).detail;
    if (!this.sdk || !this.pendingEmail) {
      this.otpEl.showError("Registration session expired. Please start over.");
      this.reset();
      return;
    }

    try {
      const result: UserVerifyEmailResponse = await this.sdk.verifyEmail(
        this.pendingEmail,
        code
      );

      this.dispatchEvent(
        new CustomEvent<{ email: string; response: UserVerifyEmailResponse }>(
          "sentinel-register-complete",
          {
            detail: { email: this.pendingEmail, response: result },
            bubbles: true,
            composed: true,
          }
        )
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Verification failed";
      this.otpEl.showError(message);
    } finally {
      this.otpEl.finishSubmitting();
    }
  };

  private showStep(step: "register" | "verify") {
    this.registerStep.classList.toggle("active", step === "register");
    this.verifyStep.classList.toggle("active", step === "verify");

    if (step === "verify") {
      const firstInput = this.otpEl.shadowRoot?.querySelector(
        "input.digit"
      ) as HTMLInputElement | null;
      firstInput?.focus();
    }
  }

  reset() {
    this.pendingEmail = null;
    this.otpEl.reset();
    this.showStep("register");
  }
}

customElements.define(
  "sentinel-auth-register-flow",
  SentinelAuthRegisterFlowElement
);
