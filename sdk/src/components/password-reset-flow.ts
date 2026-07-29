import type { SentinelAuth } from "../index.js";
import "./forgot-password-form.js";
import "./reset-password-form.js";
import type { SentinelAuthForgotPasswordElement } from "./forgot-password-form.js";
import type { SentinelAuthResetPasswordElement } from "./reset-password-form.js";

const TEMPLATE = /* html */ `
<style>
  :host { display: block; }
  .step { display: none; }
  .step.active { display: block; }
</style>

<div class="step request-step active">
  <sentinel-auth-forgot-password></sentinel-auth-forgot-password>
</div>
<div class="step reset-step">
  <sentinel-auth-reset-password></sentinel-auth-reset-password>
</div>
`;

export class SentinelAuthPasswordResetFlowElement extends HTMLElement {
  private sdk: SentinelAuth | null = null;
  private requestStep: HTMLElement;
  private resetStep: HTMLElement;
  private forgotEl: SentinelAuthForgotPasswordElement;
  private resetEl: SentinelAuthResetPasswordElement;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = TEMPLATE;

    this.requestStep = shadow.querySelector(".request-step")!;
    this.resetStep = shadow.querySelector(".reset-step")!;
    this.forgotEl = shadow.querySelector("sentinel-auth-forgot-password")!;
    this.resetEl = shadow.querySelector("sentinel-auth-reset-password")!;

    this.forgotEl.addEventListener(
      "sentinel-forgot-password-sent",
      this.handleRequestSent as EventListener
    );
    this.resetEl.addEventListener(
      "sentinel-reset-password-success",
      this.handleResetSuccess as EventListener
    );
  }

  setSdk(sdk: SentinelAuth) {
    this.sdk = sdk;
    this.forgotEl.setSdk(sdk);
    this.resetEl.setSdk(sdk);
  }

  private handleRequestSent = (e: CustomEvent<{ email: string }>) => {
    this.resetEl.setEmail(e.detail.email);
    this.showStep("reset");
  };

  private handleResetSuccess = (
    e: CustomEvent<{ email: string; message: string }>
  ) => {
    this.dispatchEvent(
      new CustomEvent<{ email: string; message: string }>(
        "sentinel-password-reset-complete",
        {
          detail: e.detail,
          bubbles: true,
          composed: true,
        }
      )
    );
  };
  private showStep(step: "request" | "reset") {
    this.requestStep.classList.toggle("active", step === "request");
    this.resetStep.classList.toggle("active", step === "reset");

    if (step === "reset") {
      const firstInput = this.resetEl.shadowRoot
        ?.querySelector("sentinel-auth-otp")
        ?.shadowRoot?.querySelector("input.digit") as HTMLInputElement | null;
      firstInput?.focus();
    }
  }

  reset() {
    this.resetEl.reset();
    this.showStep("request");
  }
}
customElements.define(
  "sentinel-auth-password-reset-flow",
  SentinelAuthPasswordResetFlowElement
);
