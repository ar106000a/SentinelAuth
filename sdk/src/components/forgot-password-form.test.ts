import { describe, it, expect, vi, beforeEach } from "vitest";
import "./forgot-password-form.js";
import type { SentinelAuth } from "../index.js";

function createMockSdk(overrides: Partial<SentinelAuth> = {}): SentinelAuth {
  return { forgotPassword: vi.fn(), ...overrides } as unknown as SentinelAuth;
}

function submit(el: any, email: string) {
  el.shadowRoot.querySelector("#fp-email").value = email;
  el.shadowRoot
    .querySelector("form")
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

async function tick() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("sentinel-auth-forgot-password", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders an email field", () => {
    const el = document.createElement("sentinel-auth-forgot-password") as any;
    document.body.appendChild(el);

    expect(el.shadowRoot.querySelector("#fp-email")).toBeTruthy();
  });

  it("calls sdk.forgotPassword with the entered email", async () => {
    const mockForgot = vi.fn().mockResolvedValue({
      message: "If this email is registered, a reset code has been sent.",
    });
    const sdk = createMockSdk({ forgotPassword: mockForgot });

    const el = document.createElement("sentinel-auth-forgot-password") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submit(el, "someone@example.com");
    await tick();

    expect(mockForgot).toHaveBeenCalledWith("someone@example.com");
  });

  it("shows the exact server message on success", async () => {
    const sdk = createMockSdk({
      forgotPassword: vi.fn().mockResolvedValue({
        message: "If this email is registered, a reset code has been sent.",
      }),
    });

    const el = document.createElement("sentinel-auth-forgot-password") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submit(el, "someone@example.com");
    await tick();

    const status = el.shadowRoot.querySelector(".status");
    expect(status.textContent).toBe(
      "If this email is registered, a reset code has been sent."
    );
    expect(status.classList.contains("success")).toBe(true);
  });

  it("shows the IDENTICAL success message regardless of whether the email exists — no enumeration", async () => {
    // Simulate the API's actual behavior: same response for registered
    // and unregistered emails. This test locks in that the component
    // has no branch that could differentiate them.
    const identicalResponse = {
      message: "If this email is registered, a reset code has been sent.",
    };
    const sdk = createMockSdk({
      forgotPassword: vi.fn().mockResolvedValue(identicalResponse),
    });

    const el = document.createElement("sentinel-auth-forgot-password") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submit(el, "definitely-not-registered@example.com");
    await tick();

    const status = el.shadowRoot.querySelector(".status");
    expect(status.textContent).toBe(identicalResponse.message);
    expect(status.classList.contains("error")).toBe(false);
  });

  it("dispatches sentinel-forgot-password-sent on success, not a 'found'-implying event", async () => {
    const sdk = createMockSdk({
      forgotPassword: vi.fn().mockResolvedValue({ message: "sent" }),
    });

    const el = document.createElement("sentinel-auth-forgot-password") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    const handler = vi.fn();
    el.addEventListener("sentinel-forgot-password-sent", handler);

    submit(el, "someone@example.com");
    await tick();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail.email).toBe("someone@example.com");
  });

  it("shows a generic error on network/transport failure", async () => {
    const sdk = createMockSdk({
      forgotPassword: vi
        .fn()
        .mockRejectedValue(new Error("Network request failed")),
    });

    const el = document.createElement("sentinel-auth-forgot-password") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submit(el, "someone@example.com");
    await tick();

    const status = el.shadowRoot.querySelector(".status");
    expect(status.textContent).toBe("Network request failed");
    expect(status.classList.contains("error")).toBe(true);
  });

  it("clears status when the user edits the email after a response", async () => {
    const sdk = createMockSdk({
      forgotPassword: vi.fn().mockResolvedValue({ message: "sent" }),
    });

    const el = document.createElement("sentinel-auth-forgot-password") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submit(el, "someone@example.com");
    await tick();
    expect(el.shadowRoot.querySelector(".status").textContent).toBe("sent");

    const emailInput = el.shadowRoot.querySelector("#fp-email");
    emailInput.value = "different@example.com";
    emailInput.dispatchEvent(new Event("input", { bubbles: true }));

    expect(el.shadowRoot.querySelector(".status").textContent).toBe("");
  });

  it("disables submit button while request is in flight", async () => {
    let resolveForgot!: (v: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveForgot = resolve;
    });
    const sdk = createMockSdk({
      forgotPassword: vi.fn().mockReturnValue(pending),
    });

    const el = document.createElement("sentinel-auth-forgot-password") as any;
    document.body.appendChild(el);
    el.setSdk(sdk);

    submit(el, "someone@example.com");
    await tick();

    const button = el.shadowRoot.querySelector("button");
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Sending...");

    resolveForgot({ message: "sent" });
    await tick();

    expect(button.disabled).toBe(false);
  });
});
