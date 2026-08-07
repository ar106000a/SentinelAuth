const DIGIT_COUNT = 6;

const TEMPLATE = /* html */ `
<style>
  :host {
    display: block;
    font-family: var(--sentinel-font-family, system-ui, -apple-system, sans-serif);
    --_primary: var(--sentinel-primary-color, #2563eb);
    --_error: var(--sentinel-error-color, #dc2626);
    --_text: var(--sentinel-text-color, #1f2937);
    --_border: var(--sentinel-border-color, #d1d5db);
    --_bg: var(--sentinel-background-color, #ffffff);
    --_radius: var(--sentinel-border-radius, 8px);
  }

  .container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: var(--sentinel-max-width, 360px);
  }

  .digits {
    display: flex;
    gap: 0.5rem;
  }

  input.digit {
    width: 2.75rem;
    height: 3.25rem;
    text-align: center;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--_text);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    background: var(--sentinel-input-background, #ffffff);
    box-sizing: border-box;
  }

  input.digit:focus {
    outline: none;
    border-color: var(--_primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--_primary) 20%, transparent);
  }

  input.digit.error {
    border-color: var(--_error);
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
    align-self: flex-start;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error-message {
    color: var(--_error);
    font-size: 0.875rem;
    min-height: 1.25rem;
  }
</style>

<div class="container">
  <div class="digits"></div>
  <div class="error-message" role="alert"></div>
  <button type="button" part="submit" disabled>Verify</button>
</div>
`;

export class SentinelAuthOtpElement extends HTMLElement {
  private inputs: HTMLInputElement[] = [];
  private errorEl: HTMLElement;
  private submitBtn: HTMLButtonElement;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = TEMPLATE;

    const digitsContainer = shadow.querySelector(".digits")!;
    for (let i = 0; i < DIGIT_COUNT; i++) {
      const input = document.createElement("input");
      input.type = "text";
      input.inputMode = "numeric";
      input.maxLength = 1;
      input.classList.add("digit");
      input.setAttribute("aria-label", `Digit ${i + 1} of ${DIGIT_COUNT}`);
      digitsContainer.appendChild(input);
      this.inputs.push(input);
    }

    this.errorEl = shadow.querySelector(".error-message")!;
    this.submitBtn = shadow.querySelector("button")!;

    this.inputs.forEach((input, index) => {
      input.addEventListener("input", (e) => this.handleInput(e, index));
      input.addEventListener("keydown", (e) => this.handleKeydown(e, index));
      input.addEventListener("paste", (e) => this.handlePaste(e));
    });

    this.submitBtn.addEventListener("click", this.handleSubmit);
  }

  private handleInput = (e: Event, index: number) => {
    const input = e.target as HTMLInputElement;
    // Only allow digits — strip anything else
    input.value = input.value.replace(/\D/g, "").slice(0, 1);

    this.clearError();

    if (input.value && index < DIGIT_COUNT - 1) {
      this.inputs[index + 1].focus();
    }

    this.updateSubmitState();
  };

  private handleKeydown = (e: KeyboardEvent, index: number) => {
    const input = e.target as HTMLInputElement;

    if (e.key === "Backspace" && !input.value && index > 0) {
      // Empty box, backspace — move to previous box
      this.inputs[index - 1].focus();
      this.inputs[index - 1].value = "";
      this.updateSubmitState();
    }

    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      this.inputs[index - 1].focus();
    }

    if (e.key === "ArrowRight" && index < DIGIT_COUNT - 1) {
      e.preventDefault();
      this.inputs[index + 1].focus();
    }

    if (e.key === "Enter") {
      e.preventDefault();

      if (!this.submitBtn.disabled) {
        this.handleSubmit();
      }
    }
  };

    public readOtp(): string {
    const inputs = Array.from(
      this.shadowRoot?.querySelectorAll("input.digit") ?? []
    ) as HTMLInputElement[];
    return inputs.map((input) => input.value).join("");
  }

  private handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData?.getData("text") ?? "";
    const digits = pasted.replace(/\D/g, "").slice(0, DIGIT_COUNT);

    digits.split("").forEach((digit, i) => {
      if (this.inputs[i]) this.inputs[i].value = digit;
    });

    // Focus the box after the last pasted digit, or the last box if fully filled
    const nextIndex = Math.min(digits.length, DIGIT_COUNT - 1);
    this.inputs[nextIndex].focus();

    this.clearError();
    this.updateSubmitState();
  };

  private updateSubmitState() {
    const complete = this.inputs.every((input) => input.value.length === 1);
    this.submitBtn.disabled = !complete;
  }

  private getCode(): string {
    return this.inputs.map((input) => input.value).join("");
  }

  private clearError() {
    this.errorEl.textContent = "";
    this.inputs.forEach((input) => input.classList.remove("error"));
  }

  /** Displays an error state and re-focuses the first box for retry. */
  showError(message: string) {
    this.errorEl.textContent = message;
    this.inputs.forEach((input) => input.classList.add("error"));
    this.inputs.forEach((input) => (input.value = ""));
    this.inputs[0].focus();
    this.updateSubmitState();
  }

  /** Resets the component to empty state — useful after a successful verification elsewhere. */
  reset() {
    this.inputs.forEach((input) => (input.value = ""));
    this.clearError();
    this.updateSubmitState();
    this.inputs[0].focus();
  }

  private handleSubmit = () => {
    const code = this.getCode();
    if (code.length !== DIGIT_COUNT) return;

    this.submitBtn.disabled = true;
    this.submitBtn.textContent = "Verifying...";

    this.dispatchEvent(
      new CustomEvent<{ code: string }>("sentinel-otp-submit", {
        detail: { code },
        bubbles: true,
        composed: true,
      })
    );
  };

  /** Re-enables the submit button — call after handling the submit event's result. */
  finishSubmitting() {
    this.submitBtn.disabled = false;
    this.submitBtn.textContent = "Verify";
  }
}

customElements.define("sentinel-auth-otp", SentinelAuthOtpElement);
