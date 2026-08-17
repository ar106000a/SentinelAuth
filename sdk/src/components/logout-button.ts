import { type SentinelAuth } from "../index.js";

const template = /*html*/ `
    <style>
  :host {
    display: block;
    font-family: var(
      --sentinel-font-family,
      system-ui,
      -apple-system,
      sans-serif
    );
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

<button class="primary logout-btn">
    Logout
</button>
<div class="form-error error-message" role="alert"></div>


`;
export class SentinelAuthLogoutElement extends HTMLElement {
  private sdk: SentinelAuth | null = null;
  private logoutBtn: HTMLButtonElement;
  private errorElem: HTMLElement;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = template;

    this.logoutBtn = shadow.querySelector(".logout-btn")!;
    this.errorElem = shadow.querySelector(".error-message")!;

    this.logoutBtn.addEventListener(
      "click",
      this.handleLogout as EventListener
    );
  }
  setSdk(sdk: SentinelAuth) {
    this.sdk = sdk;
  }

  

  handleLogout = async () => {
    const accessToken= this.sdk?.getAccessToken();
    if (!this.sdk) {
      this.setFormError("SDK not connected! Start over.");
      return;
    }
    if (!accessToken) {
      this.setFormError("Access Token not initialized!");
      return;
    }

    this.logoutBtn.disabled = true;
    this.logoutBtn.textContent = "Logging out...";

    try {
      const result = await this.sdk.logout(accessToken);
      this.dispatchEvent(
        new CustomEvent("sentinel-logout-complete", {
          detail: { message: result.message },
          composed: true,
          bubbles: true,
        })
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong!";
      this.setFormError(message);
      this.dispatchEvent(
        new CustomEvent("sentinel-logout-error", {
          detail: { message: message },
          bubbles: true,
          composed: true,
        })
      );
    } finally {
      this.logoutBtn.textContent = "Logout";
      this.logoutBtn.disabled = false;
    }
  };

  setFormError(error: string) {
    this.errorElem.textContent = error;
  }
  reset() {
    this.logoutBtn.textContent = "Logout";
    this.logoutBtn.disabled = false;
    this.errorElem.textContent = "";
  }
}
customElements.define("sentinel-auth-logout-button", SentinelAuthLogoutElement);
