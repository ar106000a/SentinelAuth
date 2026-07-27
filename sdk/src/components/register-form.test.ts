import { describe, it, expect, vi, beforeEach } from "vitest";
import "./register-form.js";
import type { SentinelAuth } from "../index.js";

function createMockSdk(overrides: Partial<SentinelAuth> = {}): SentinelAuth {
  return { register: vi.fn(), ...overrides } as unknown as SentinelAuth;
}

function submitForm(el: any) {
  el.shadowRoot
    .querySelector("form")
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function setValues(el: any, email: string, password: string) {
  el.shadowRoot.querySelector("#email").value = email;
  el.shadowRoot.querySelector("#password").value = password;
  el.shadowRoot.querySelector("#confirm-password").value = password;
}

async function tick() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("sentinel-auth-register", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders email and password fields", () => {
    const el = document.createElement("sentinel-auth-register") as any;
    document.body.appendChild(el);

    expect(el.shadowRoot.querySelector("#email")).toBeTruthy();
    expect(el.shadowRoot.querySelector("#password")).toBeTruthy();
  });

  it("shows an error if SDK is not connected", async () => {
    const el = document.createElement("sentinel-auth-register") as any;
    document.body.appendChild(el);

    submitForm(el);
    await tick();

    expect(el.shadowRoot.querySelector(".form-error").textContent).toContain(
      "not connected"
    );
  });

  it("calls sdk.register with form values", async () => {
    const mockRegister = vi
      .fn()
      .mockResolvedValue({ message: "check your email" });
    const sdk = createMockSdk({ register: mockRegister });

    const el = document.createElement("sentinel-auth-register") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    setValues(el, "new@example.com", "SecurePass123");
    submitForm(el);
    await tick();

    expect(mockRegister).toHaveBeenCalledWith(
      "new@example.com",
      "SecurePass123"
    );
  });

  it("dispatches sentinel-register-success on success", async () => {
    const sdk = createMockSdk({
      register: vi.fn().mockResolvedValue({ message: "check your email" }),
    });

    const el = document.createElement("sentinel-auth-register") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    const handler = vi.fn();
    el.addEventListener("sentinel-register-success", handler);

    setValues(el, "new@example.com", "SecurePass123");
    submitForm(el);
    await tick();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.email).toBe("new@example.com");
  });

  it("highlights the email field on CONFLICT error", async () => {
    const err = Object.assign(
      new Error("An account with this email already exists"),
      {
        code: "CONFLICT",
      }
    );
    const sdk = createMockSdk({ register: vi.fn().mockRejectedValue(err) });

    const el = document.createElement("sentinel-auth-register") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    setValues(el, "taken@example.com", "SecurePass123");
    submitForm(el);
    await tick();

    const emailInput = el.shadowRoot.querySelector("#email");
    const errorEl = el.shadowRoot.querySelector(".form-error");

    expect(emailInput.classList.contains("invalid")).toBe(true);
    expect(errorEl.textContent).toContain("already exists");
  });

  it("highlights the password field with server message on VALIDATION_ERROR", async () => {
    const err = Object.assign(
      new Error(
        "This password has appeared in a known data breach. Please choose a different password."
      ),
      { code: "VALIDATION_ERROR" }
    );
    const sdk = createMockSdk({ register: vi.fn().mockRejectedValue(err) });

    const el = document.createElement("sentinel-auth-register") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    setValues(el, "new@example.com", "password");
    submitForm(el);
    await tick();

    const passwordInput = el.shadowRoot.querySelector("#password");
    const hint = el.shadowRoot.querySelector("#password-hint");

    expect(passwordInput.classList.contains("invalid")).toBe(true);
    expect(hint.textContent).toContain("data breach");
    expect(hint.classList.contains("error")).toBe(true);
  });

  it("falls back to generic form error for an unrecognized error code", async () => {
    const err = Object.assign(new Error("Something unexpected happened"), {
      code: "SOME_UNKNOWN_CODE",
    });
    const sdk = createMockSdk({ register: vi.fn().mockRejectedValue(err) });

    const el = document.createElement("sentinel-auth-register") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    setValues(el, "new@example.com", "SecurePass123");
    submitForm(el);
    await tick();

    expect(el.shadowRoot.querySelector(".form-error").textContent).toBe(
      "Something unexpected happened"
    );
  });

  it("clears field error state when the user edits the corrected field", async () => {
    const err = Object.assign(
      new Error("An account with this email already exists"),
      {
        code: "CONFLICT",
      }
    );
    const sdk = createMockSdk({ register: vi.fn().mockRejectedValue(err) });

    const el = document.createElement("sentinel-auth-register") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    setValues(el, "taken@example.com", "SecurePass123");
    submitForm(el);
    await tick();

    const emailInput = el.shadowRoot.querySelector("#email");
    expect(emailInput.classList.contains("invalid")).toBe(true);

    emailInput.value = "different@example.com";
    emailInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(emailInput.classList.contains("invalid")).toBe(false);
    expect(el.shadowRoot.querySelector(".form-error").textContent).toBe("");
  });

  it("disables submit button while request is in flight", async () => {
    let resolveRegister!: (v: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveRegister = resolve;
    });
    const sdk = createMockSdk({ register: vi.fn().mockReturnValue(pending) });

    const el = document.createElement("sentinel-auth-register") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    setValues(el, "new@example.com", "SecurePass123");
    submitForm(el);
    await tick();

    const button = el.shadowRoot.querySelector("button");
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Creating account...");

    resolveRegister({ message: "check your email" });
    await tick();

    expect(button.disabled).toBe(false);
  });
  it("shows mismatch hint immediately when confirm password differs", async () => {
    const el = document.createElement("sentinel-auth-register") as any;
    document.body.appendChild(el);

    const password = el.shadowRoot.querySelector("#password");
    const confirm = el.shadowRoot.querySelector("#confirm-password");

    password.value = "SecurePass123";
    password.dispatchEvent(new Event("input", { bubbles: true }));
    confirm.value = "DifferentPass456";
    confirm.dispatchEvent(new Event("input", { bubbles: true }));

    expect(confirm.classList.contains("invalid")).toBe(true);
    expect(el.shadowRoot.querySelector("#confirm-hint").textContent).toBe(
      "Passwords do not match."
    );
  });

  it("clears mismatch hint once passwords match", async () => {
    const el = document.createElement("sentinel-auth-register") as any;
    document.body.appendChild(el);

    const password = el.shadowRoot.querySelector("#password");
    const confirm = el.shadowRoot.querySelector("#confirm-password");

    password.value = "SecurePass123";
    password.dispatchEvent(new Event("input", { bubbles: true }));
    confirm.value = "SecurePass123";
    confirm.dispatchEvent(new Event("input", { bubbles: true }));

    expect(confirm.classList.contains("invalid")).toBe(false);
    expect(el.shadowRoot.querySelector("#confirm-hint").textContent).toBe("");
  });

  it("blocks submission and never calls sdk.register when passwords mismatch", async () => {
    const mockRegister = vi.fn();
    const sdk = createMockSdk({ register: mockRegister });

    const el = document.createElement("sentinel-auth-register") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    el.shadowRoot.querySelector("#email").value = "new@example.com";
    el.shadowRoot.querySelector("#password").value = "SecurePass123";
    el.shadowRoot.querySelector("#confirm-password").value = "Mismatch456";

    el.shadowRoot
      .querySelector("form")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));

    expect(mockRegister).not.toHaveBeenCalled();
  });
});
