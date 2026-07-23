import type { SentinelAuth } from "../index.js";
import type { LoginResponse } from "@sentinelauth/types";

const TEMPLATE = /* html */ `
<style>
  :host {
    display: block;
    font-family: var(--sentinel-font-family, system-ui, -apple-system, sans-serif);
    --_primary: var(--sentinel-primary-color, #2563eb);
    --_primary-hover: var(--sentinel-primary-hover-color, #1d4ed8);
    --_error: var(--sentinel-error-color, #dc2626);
    --_text: var(--sentinel-text-color, #1f2937);
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

  button:hover:not(:disabled) {
    background: var(--_primary-hover);
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error {
    color: var(--_error);
    font-size: 0.875rem;
    min-height: 1.25rem;
  }

  .field {
    display: flex;
    flex-direction: column;
  }
</style>

<form>
  <div class="field">
    <label for="email">Email</label>
    <input type="email" id="email" name="email" required autocomplete="email" />
  </div>
  <div class="field">
    <label for="password">Password</label>
    <input type="password" id="password" name="password" required autocomplete="current-password" />
  </div>
  <div class="error" role="alert"></div>
  <button type="submit">Sign in</button>
</form>
`;

export class SentinelAuthLoginElement extends HTMLElement {
  private sdk: SentinelAuth | null = null;
  private form: HTMLFormElement;
  private errorEl: HTMLElement;
  private submitBtn: HTMLButtonElement;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = TEMPLATE;

    this.form = shadow.querySelector("form")!;
    this.errorEl = shadow.querySelector(".error")!;
    this.submitBtn = shadow.querySelector("button")!;

    this.form.addEventListener("submit", this.handleSubmit);
  }

  /**
   * Must be called before the component is used — connects the
   * component to an SDK instance. Not done via attribute because
   * the SDK instance carries live config (apiUrl, publicKey), not
   * a serializable string.
   */
  setSdk(sdk: SentinelAuth) {
    this.sdk = sdk;
  }

  private handleSubmit = async (e: Event) => {
    e.preventDefault();
    this.errorEl.textContent = "";

    if (!this.sdk) {
      this.errorEl.textContent = "SentinelAuth SDK not connected to this component.";
      return;
    }

    const formData = new FormData(this.form);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    this.submitBtn.disabled = true;
    this.submitBtn.textContent = "Signing in...";

    try {
      const result = await this.sdk.login(email, password);
      this.dispatchEvent(
        new CustomEvent<LoginResponse>("sentinel-login-success", {
          detail: result,
          bubbles: true,
          composed: true, // crosses the shadow boundary — tenant page can listen
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      this.errorEl.textContent = message;
      this.dispatchEvent(
        new CustomEvent("sentinel-login-error", {
          detail: { message },
          bubbles: true,
          composed: true,
        })
      );
    } finally {
      this.submitBtn.disabled = false;
      this.submitBtn.textContent = "Sign in";
    }
  };
}

customElements.define("sentinel-auth-login", SentinelAuthLoginElement);