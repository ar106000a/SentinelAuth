import { SentinelAuthError, type SentinelAuth } from "../index";
import { SentinelAuthOtpElement } from "./otp-input";
import "./otp-input";

const template = `
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
      .field {
    display: flex;
    flex-direction: column;
  }
     label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--_text);
    margin-bottom: 0.25rem;
    display: block;
  }

  button.primary:hover:not(:disabled) { background: var(--_primary-hover); }
  button.primary:disabled { opacity: 0.6; cursor: not-allowed; }

  sentinel-auth-otp::part('submit'){
    display:none;
  }

  .form-error { color: var(--_error); font-size: 0.875rem; min-height: 1.25rem; }
</style>

<div class="container">

  <div class='field'>
    <label for="password">Password</label>
    <input name="password" id="mfad-password" required autocomplete="current password" class='password-input' type='password'>
  </div>
    <sentinel-auth-otp></sentinel-auth-otp>
    <button class='primary submit-btn'> Disable MFA </button>

  <div class="form-error error-message" role="alert"></div>
</div>
 `;

export class SentinelAuthMfaDisableElement extends HTMLElement {
  private sdk: SentinelAuth | null = null;
  private otpEl: SentinelAuthOtpElement;
  private passwordField: HTMLInputElement;
  private submitBtn: HTMLButtonElement;
  private errorEl: HTMLElement;
  private accessToken: string | null = null;
  private currentCode: string = "";

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = template;
    this.otpEl = shadow.querySelector("sentinel-auth-otp")!;
    this.passwordField = shadow.querySelector(".password-input")!;
    this.submitBtn = shadow.querySelector(".submit-btn")!;
    this.errorEl = shadow.querySelector(".form-error")!;

    // this.otpEl.addEventListener("sentinel-otp-submit",((e:Event)=>{
    //   const {code} = (e as CustomEvent<{code:string}>).detail;
    //   this.currentCode=code;

    //   this.otpEl.finishSubmitting();
    // }) as EventListener)
    this.submitBtn.addEventListener(
      "click",
      this.handleSubmit as EventListener
    );
  }

  setSdk(sdk: SentinelAuth) {
    this.sdk = sdk;
  }
  setAccessToken(accessToken: string) {
    this.accessToken = accessToken;
  }

  handleSubmit = async () => {
    if (!this.sdk) {
      this.setFormError("SDK not connected. Start over again!");
      return;
    }
    if (!this.accessToken) {
      this.setFormError("SDK not initialized with access token!");
      return;
    }
    const password = this.passwordField.value;
    const code = this.otpEl.readOtp();

    if (!password) {
      this.setFormError("Please insert the password.");
      return;
    }
    if (code.length !== 6) {
      this.errorEl.textContent = "Please enter the 6-digit code.";
      return;
    }

    this.submitBtn.disabled = true;
    this.submitBtn.textContent = "Disabling...";
    this.passwordField.classList.remove("invalid");
    try {
      const result = await this.sdk.disableMfa(
        this.accessToken,
        password,
        code
      );

      this.dispatchEvent(
        new CustomEvent("sentinel-mfa-disable-complete", {
          detail: { message: result.message },
          bubbles: true,
          composed: true,
        })
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong!";
      this.errorEl.textContent = message;
      this.otpEl.showError(message);
      if (message === "Invalid password!") {
        this.passwordField.classList.add("invalid");
      }

      this.dispatchEvent(
        new CustomEvent("sentinel-mfa-disable-error", {
          detail: { message: message },
          composed: true,
          bubbles: true,
        })
      );
    } finally {
      this.submitBtn.disabled = false;
      this.submitBtn.textContent = "Disable MFA";
    }
  };
  reset() {
    this.errorEl.textContent = "";
    this.passwordField.value = "";
    this.otpEl.reset();
  }
  setFormError(error: string) {
    this.errorEl.textContent = error;
  }
}
customElements.define(
  "sentinel-auth-mfa-disable",
  SentinelAuthMfaDisableElement
);
