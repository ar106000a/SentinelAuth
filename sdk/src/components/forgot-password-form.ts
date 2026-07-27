import type { SentinelAuth } from "../index.js";

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

  .status {
    font-size: 0.875rem;
    min-height: 1.25rem;
  }

  .status.success { color: var(--_success); }
  .status.error { color: var(--_error); }
</style>

<form novalidate>
  <p class="intro">Enter your email and we'll send you a code to reset your password.</p>
  <div class="field">
    <label for="fp-email">Email</label>
    <input type="email" id="fp-email" name="email" required autocomplete="email" />
  </div>
  <div class="status" role="status"></div>
  <button type="submit">Send reset code</button>
</form>
`;

export class SentinelAuthForgotPasswordElement extends HTMLElement {
  private sdk: SentinelAuth | null = null;
  private form: HTMLFormElement;
  private emailInput: HTMLInputElement;
  private statusEl: HTMLElement;
  private submitBtn: HTMLButtonElement;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = TEMPLATE;

    this.form = shadow.querySelector("form")!;
    this.emailInput = shadow.querySelector("#fp-email")!;
    this.statusEl = shadow.querySelector(".status")!;
    this.submitBtn = shadow.querySelector("button")!;

    this.form.addEventListener("submit", this.handleSubmit);
    this.emailInput.addEventListener("input", this.clearStatus);
  }

  setSdk(sdk: SentinelAuth) {
    this.sdk = sdk;
  }

  private clearStatus = () => {
    this.statusEl.textContent = "";
    this.statusEl.classList.remove("success", "error");
    this.emailInput.classList.remove("invalid");
  };

  private handleSubmit = async (e: Event) => {
    e.preventDefault();
    this.clearStatus();

    if (!this.sdk) {
      this.statusEl.textContent = "SentinelAuth SDK not connected to this component.";
      this.statusEl.classList.add("error");
      return;
    }

    const email = this.emailInput.value;

    this.submitBtn.disabled = true;
    this.submitBtn.textContent = "Sending...";

    try {
      // Deliberately do NOT branch on whether the email exists — the API
      // itself returns an identical response either way (Week 3 design,
      // prevents account enumeration). This component must not undo that
      // protection by treating "found" vs "not found" differently at the
      // UI layer, since there is no such distinction to react to.
      const result = await this.sdk.forgotPassword(email);

      this.statusEl.textContent = result.message;
      this.statusEl.classList.add("success");

      this.dispatchEvent(
        new CustomEvent<{ email: string }>("sentinel-forgot-password-sent", {
          detail: { email },
          bubbles: true,
          composed: true,
        })
      );
    } catch (err) {
      // The only errors that can actually reach here are transport-level
      // (network failure) or malformed input (invalid email format) —
      // never "email not found", since the API doesn't distinguish that.
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";

      if (/email/i.test(message)) {
        this.emailInput.classList.add("invalid");
      }

      this.statusEl.textContent = message;
      this.statusEl.classList.add("error");

      this.dispatchEvent(
        new CustomEvent("sentinel-forgot-password-error", {
          detail: { message },
          bubbles: true,
          composed: true,
        })
      );
    } finally {
      this.submitBtn.disabled = false;
      this.submitBtn.textContent = "Send reset code";
    }
  };
}

customElements.define("sentinel-auth-forgot-password", SentinelAuthForgotPasswordElement);