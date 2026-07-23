import { describe, it, expect, beforeEach, vi } from "vitest";
import "./otp-input.js";

function getInputs(el: any): HTMLInputElement[] {
  return Array.from(el.shadowRoot.querySelectorAll("input.digit"));
}

function typeDigit(input: HTMLInputElement, digit: string) {
  input.value = digit;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("sentinel-auth-otp", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders 6 digit input boxes", () => {
    const el = document.createElement("sentinel-auth-otp") as any;
    document.body.appendChild(el);

    expect(getInputs(el)).toHaveLength(6);
  });

  it("auto-advances focus to the next box on digit entry", () => {
    const el = document.createElement("sentinel-auth-otp") as any;
    document.body.appendChild(el);
    const inputs = getInputs(el);

    typeDigit(inputs[0], "1");

    expect(el.shadowRoot.activeElement).toBe(inputs[1]);
  });

  it("strips non-digit characters on input", () => {
    const el = document.createElement("sentinel-auth-otp") as any;
    document.body.appendChild(el);
    const inputs = getInputs(el);

    typeDigit(inputs[0], "a");
    expect(inputs[0].value).toBe("");
  });

  it("moves focus to previous box on backspace when current box is empty", () => {
    const el = document.createElement("sentinel-auth-otp") as any;
    document.body.appendChild(el);
    const inputs = getInputs(el);

    typeDigit(inputs[0], "1");
    inputs[1].focus();

    inputs[1].dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true })
    );

    expect(el.shadowRoot.activeElement).toBe(inputs[0]);
  });

  it("submit button is disabled until all 6 digits are filled", () => {
    const el = document.createElement("sentinel-auth-otp") as any;
    document.body.appendChild(el);
    const inputs = getInputs(el);
    const button = el.shadowRoot.querySelector("button");

    expect(button.disabled).toBe(true);

    inputs.forEach((input, i) => typeDigit(input, String(i)));

    expect(button.disabled).toBe(false);
  });

  it("dispatches sentinel-otp-submit with the full code on button click", () => {
    const el = document.createElement("sentinel-auth-otp") as any;
    document.body.appendChild(el);
    const inputs = getInputs(el);

    "123456".split("").forEach((digit, i) => typeDigit(inputs[i], digit));

    const submitHandler = vi.fn();
    el.addEventListener("sentinel-otp-submit", submitHandler);

    el.shadowRoot.querySelector("button").click();

    expect(submitHandler).toHaveBeenCalledTimes(1);
    expect(submitHandler.mock.calls[0][0].detail.code).toBe("123456");
  });

  it("distributes a pasted 6-digit code across all boxes", () => {
    const el = document.createElement("sentinel-auth-otp") as any;
    document.body.appendChild(el);
    const inputs = getInputs(el);

    const clipboardData = { getData: () => "654321" };
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: clipboardData,
    });

    inputs[0].dispatchEvent(pasteEvent);

    expect(inputs.map((i) => i.value).join("")).toBe("654321");
  });

  it("strips non-digit characters from pasted content", () => {
    const el = document.createElement("sentinel-auth-otp") as any;
    document.body.appendChild(el);
    const inputs = getInputs(el);

    const clipboardData = { getData: () => "12-34 56" };
    const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, "clipboardData", {
      value: clipboardData,
    });

    inputs[0].dispatchEvent(pasteEvent);

    expect(inputs.map((i) => i.value).join("")).toBe("123456");
  });

  it("showError clears all inputs, shows message, refocuses first box", () => {
    const el = document.createElement("sentinel-auth-otp") as any;
    document.body.appendChild(el);
    const inputs = getInputs(el);

    "123456".split("").forEach((digit, i) => typeDigit(inputs[i], digit));
    el.showError("Invalid code");

    const errorEl = el.shadowRoot.querySelector(".error-message");
    expect(errorEl.textContent).toBe("Invalid code");
    expect(inputs.every((i: HTMLInputElement) => i.value === "")).toBe(true);
    expect(el.shadowRoot.activeElement).toBe(inputs[0]);
  });

  it("reset clears state without an error message", () => {
    const el = document.createElement("sentinel-auth-otp") as any;
    document.body.appendChild(el);
    const inputs = getInputs(el);

    "123456".split("").forEach((digit, i) => typeDigit(inputs[i], digit));
    el.reset();

    expect(inputs.every((i: HTMLInputElement) => i.value === "")).toBe(true);
    expect(el.shadowRoot.querySelector(".error-message").textContent).toBe("");
  });

  it("finishSubmitting re-enables the button after showing 'Verifying...'", () => {
    const el = document.createElement("sentinel-auth-otp") as any;
    document.body.appendChild(el);
    const inputs = getInputs(el);
    const button = el.shadowRoot.querySelector("button");

    "123456".split("").forEach((digit, i) => typeDigit(inputs[i], digit));
    button.click();

    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Verifying...");

    el.finishSubmitting();

    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe("Verify");
  });
});
