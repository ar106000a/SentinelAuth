import type { SentinelAuth } from "../index.js";
import type { UserRegistrationResponse } from "@sentinelauth/types";

const TEMPLATE = /* html */ `
<style>
  :host {
    display: block;
    font-family: var(--sentinel-font-family, system-ui, -apple-system, sans-serif);
    --_primary: var(--sentinel-primary-color, #2563eb);
    --_primary-hover: var(--sentinel-primary-hover-color, #1d4ed8);
    --_error: var(--sentinel-error-color, #dc2626);
    --_success: var(--sentinel-success-color, #16a34a);
    --_text: var(--sentinel-text-color, #1f2937);
    --_muted: var(--sentinel-muted-text-color, #6b7280);
    --_border: var(--sentinel-border-color, #d1d5db);
    --_bg: var(--sentinel-background-color, #ffffff);
    --_radius: var(--sentinel-border-radius, 8px);
    --_spacing: var(--sentinel-spacing, 1rem);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--_spacing);
    background: var(--_bg);
    padding: var(--sentinel-padding, 1.5rem);
    border-radius: var(--_radius);
    max-width: var(--sentinel-max-width, 360px);
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

  input.invalid {
    border-color: var(--_error);
  }

  .hint {
    font-size: 0.8125rem;
    color: var(--_muted);
    margin-top: 0.25rem;
  }

  .hint.error {
    color: var(--_error);
  }

  button {
    background: var(--_primary);
    color: var(--sentinel-button-text-color, #ffffff);
    border: none;
    padding: 0.625rem 1rem;
    border-radius: var(--_radius);
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
  }

  button:hover:not(:disabled) { background: var(--_primary-hover); }
  button:disabled { opacity: 0.6; cursor: not-allowed; }

  .field { display: flex; flex-direction: column; }

  .form-error {
    color: var(--_error);
    font-size: 0.875rem;
    min-height: 1.25rem;
  }
</style>

<form novalidate>
  <div class="field">
    <label for="email">Email</label>
    <input type="email" id="email" name="email" required autocomplete="email" />
  </div>
  <div class="field">
    <label for="password">Password</label>
    <input type="password" id="password" name="password" required autocomplete="new-password" minlength="8" />
    <span class="hint" id="password-hint">At least 8 characters.</span>
  </div>
  <div class="form-error" role="alert"></div>
  <button type="submit">Create account</button>
</form>
`;

export class SentinelAuthRegisterElement extends HTMLElement {
  private sdk: SentinelAuth | null = null;
  private form: HTMLFormElement;
  private emailInput: HTMLInputElement;
  private passwordInput: HTMLInputElement;
  private passwordHint: HTMLElement;
  private errorEl: HTMLElement;
  private submitBtn: HTMLButtonElement;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = TEMPLATE;

    this.form = shadow.querySelector("form")!;
    this.emailInput = shadow.querySelector("#email")!;
    this.passwordInput = shadow.querySelector("#password")!;
    this.passwordHint = shadow.querySelector("#password-hint")!;
    this.errorEl = shadow.querySelector(".form-error")!;
    this.submitBtn = shadow.querySelector("button")!;

    this.form.addEventListener("submit", this.handleSubmit);
    this.passwordInput.addEventListener("input", this.clearFieldError);
    this.emailInput.addEventListener("input", this.clearFieldError);
  }

  setSdk(sdk: SentinelAuth) {
    this.sdk = sdk;
  }

  private clearFieldError = () => {
    this.errorEl.textContent = "";
    this.emailInput.classList.remove("invalid");
    this.passwordInput.classList.remove("invalid");
    this.passwordHint.classList.remove("error");
    this.passwordHint.textContent = "At least 8 characters.";
  };

  /**
   * Maps a SentinelAuthError's code to which field it relates to,
   * so the UI can highlight the specific input at fault rather than
   * showing one undifferentiated form-level message for everything.
   */
  private applyServerError(message: string, code: string) {
    if (code === "CONFLICT") {
      this.emailInput.classList.add("invalid");
      this.errorEl.textContent = "An account with this email already exists.";
      return;
    }

    if (code === "VALIDATION_ERROR" && /breach/i.test(message)) {
      this.passwordInput.classList.add("invalid");
      this.passwordHint.classList.add("error");
      this.passwordHint.textContent = message;
      this.errorEl.textContent = "";
      return;
    }

    if (code === "VALIDATION_ERROR") {
      this.passwordInput.classList.add("invalid");
      this.passwordHint.classList.add("error");
      this.passwordHint.textContent = message;
      this.errorEl.textContent = "";
      return;
    }

    // Unrecognized code — fall back to a generic form-level message
    this.errorEl.textContent = message;
  }

  private handleSubmit = async (e: Event) => {
    e.preventDefault();
    this.clearFieldError();

    if (!this.sdk) {
      this.errorEl.textContent =
        "SentinelAuth SDK not connected to this component.";
      return;
    }

    const email = this.emailInput.value;
    const password = this.passwordInput.value;

    this.submitBtn.disabled = true;
    this.submitBtn.textContent = "Creating account...";

    try {
      const result = await this.sdk.register(email, password);

      this.dispatchEvent(
        new CustomEvent<{ email: string; response: UserRegistrationResponse }>(
          "sentinel-register-success",
          { detail: { email, response: result }, bubbles: true, composed: true }
        )
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Registration failed";
      // SentinelAuthError carries .code; fall back gracefully if a plain Error slipped through
      const code = (err as { code?: string })?.code ?? "UNKNOWN_ERROR";

      this.applyServerError(message, code);

      this.dispatchEvent(
        new CustomEvent("sentinel-register-error", {
          detail: { message, code },
          bubbles: true,
          composed: true,
        })
      );
    } finally {
      this.submitBtn.disabled = false;
      this.submitBtn.textContent = "Create account";
    }
  };
}

customElements.define("sentinel-auth-register", SentinelAuthRegisterElement);
