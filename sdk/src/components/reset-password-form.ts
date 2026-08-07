import { SentinelAuth } from "../index";
import "./otp-input.js";
import type { SentinelAuthOtpElement } from "./otp-input.js";

const template = /*html*/ `
<style>
    :host{
    display:block;
    font-family: var(--sentinel-font-family,system-ui, -apple-system, sans-serif);
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
    container {
    display: flex;
    flex-direction: column;
    gap: var(--_spacing);
    background: var(--_bg);
    padding: var(--sentinel-padding, 1.5rem);
    border-radius: var(--_radius);
    max-width: var(--sentinel-max-width, 360px);
  }
    p.intro {
    font-size: 0.875rem;
    color: var(--_muted);
    margin: 0;
  }

  label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--_text);
    margin-bottom: 0.25rem;
    display: block;
  }
    input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    font-size: 1rem;
    color: var(--_text);
    background: var(--sentinel-input-background, #ffffff);
  }

  input:focus {
    outline: none;
    border-color: var(--_primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--_primary) 20%, transparent);
  }
    input.invalid { border-color: var(--_error); }

  .field { display: flex; flex-direction: column; }
  .hint { font-size: 0.8125rem; color: var(--_muted); margin-top: 0.25rem; }
  .hint.error { color: var(--_error); }

  /* Hide otp-input's own internal submit button — this component
     drives submission from its own outer button instead, since it
     needs the code AND the new password together, not the code alone. */
  sentinel-auth-otp::part(submit) {
    display: none;
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
  <p class="intro">Enter the code we sent you and choose a new password.</p>

  <sentinel-auth-otp></sentinel-auth-otp>

  <div class="field">
    <label for="rp-new-password">New password</label>
    <input type="password" id="rp-new-password" autocomplete="new-password" minlength="8" />
    <span class="hint" id="rp-password-hint">At least 8 characters.</span>
  </div>
  <div class="field">
    <label for="rp-confirm-password">Confirm new password</label>
    <input type="password" id="rp-confirm-password" autocomplete="new-password" />
    <span class="hint" id="rp-confirm-hint"></span>
  </div>

  <div class="form-error" role="alert"></div>
  <button type="button" class="primary">Reset password</button>
</div>
`;

export class SentinelAuthResetPasswordElement extends HTMLElement {
  private sdk: SentinelAuth | null = null;
  private email: string | null = null;
  private otpEl: SentinelAuthOtpElement;
  private newPasswordInput: HTMLInputElement;
  private confirmPasswordInput: HTMLInputElement;
  private confirmHint: HTMLElement;
  private errorEl: HTMLElement;
  private submitBtn: HTMLButtonElement;
  private currentCode: string = "";

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = template;

    this.otpEl = shadow.querySelector("sentinel-auth-otp")!;
    this.newPasswordInput = shadow.querySelector("#rp-new-password")!;
    this.confirmPasswordInput = shadow.querySelector("#rp-confirm-password")!;
    this.confirmHint = shadow.querySelector("#rp-confirm-hint")!;
    this.errorEl = shadow.querySelector(".form-error")!;
    this.submitBtn = shadow.querySelector("button.primary")!;

    this.otpEl.addEventListener("sentinel-otp-submit", ((e: Event) => {
      const { code } = (e as CustomEvent<{ code: string }>).detail;
      this.currentCode = code;

      this.otpEl.finishSubmitting();
    }) as EventListener);

    this.confirmPasswordInput.addEventListener(
      "input",
      this.checkPasswordsMatch
    );
    this.newPasswordInput.addEventListener("input", this.checkPasswordsMatch);
    this.newPasswordInput.addEventListener("input", this.clearFormError);
    this.submitBtn.addEventListener("click", this.handleSubmit);
  }

  setSdk(sdk: SentinelAuth) {
    this.sdk = sdk;
  }

  setEmail(email: string) {
    this.email = email;
  }

  private checkPasswordsMatch = () => {
    if (!this.confirmPasswordInput.value) {
      this.confirmHint.textContent = "";
      this.confirmPasswordInput.classList.remove("invalid");
      return;
    }
    const matches =
      this.newPasswordInput.value === this.confirmPasswordInput.value;
    this.confirmPasswordInput.classList.toggle("invalid", !matches);
    this.confirmHint.textContent = matches ? "" : "Passwords do not match.";
    this.confirmHint.classList.toggle("error", !matches);
  };
  private clearFormError = () => {
    this.errorEl.textContent = "";
  };
  private handleSubmit = async () => {
    this.clearFormError();

    if (!this.sdk || !this.email) {
      this.errorEl.textContent =
        "Reset Session not initialized. Please start over again!";
      return;
    }

    const code = this.otpEl.readOtp();

    if (code.length !== 6) {
      this.errorEl.textContent = "Please enter the 6-digit code.";
      return;
    }
    const newPassword = this.newPasswordInput.value;
    const confirmPassword = this.confirmPasswordInput.value;
    if (newPassword !== confirmPassword) {
      this.confirmPasswordInput.classList.add("invalid");
      this.confirmHint.textContent = "Passwords do not match";
      this.confirmHint.classList.add("error");
      return;
    }
    this.submitBtn.disabled = true;
    this.submitBtn.textContent = "Resetting...";

    try {
      const result = await this.sdk.resetPassword(
        this.email,
        code,
        newPassword
      );

      this.dispatchEvent(
        new CustomEvent("sentinel-reset-password-success", {
          detail: { email: this.email, message: result.message },
          bubbles: true,
          composed: true,
        })
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Password reset failed";
      this.errorEl.textContent = message;
      this.otpEl.showError(message);

      this.dispatchEvent(
        new CustomEvent("sentinel-reset-password-error", {
          detail: { message },
          bubbles: true,
          composed: true,
        })
      );
    } finally {
      this.submitBtn.disabled = false;
      this.submitBtn.textContent = "Reset Password";
    }
  };

  // private readOtp(): string {
  //   const inputs = Array.from(
  //     this.otpEl.shadowRoot?.querySelectorAll("input.digit") ?? []
  //   ) as HTMLInputElement[];
  //   return inputs.map((input) => input.value).join("");
  // }

  reset() {
    this.email = null;
    this.currentCode = "";
    this.otpEl.reset();
    this.newPasswordInput.value = "";
    this.confirmPasswordInput.value = "";
    this.clearFormError();
    this.confirmHint.textContent = "";
    this.confirmPasswordInput.classList.remove("invalid");
  }
}

customElements.define(
  "sentinel-auth-reset-password",
  SentinelAuthResetPasswordElement
);
