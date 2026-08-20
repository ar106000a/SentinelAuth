import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { SentinelAuthProvider } from "./SentinelAuthProvider.js";
import { SentinelAuthRegisterFlow } from "./SentinelAuthRegisterFlow.js";

vi.mock("@sentinelauth/sdk", () => {
  const mockInstance = { register: vi.fn(), verifyEmail: vi.fn() };
  return { SentinelAuth: vi.fn().mockImplementation(() => mockInstance) };
});

vi.mock("@sentinelauth/sdk/components", () => {
  if (!customElements.get("sentinel-auth-register-flow")) {
    class FakeRegisterFlow extends HTMLElement {
      setSdk() {}
    }
    customElements.define("sentinel-auth-register-flow", FakeRegisterFlow);
  }
  return {};
});

function renderWithProvider(children: React.ReactNode) {
  return render(
    <SentinelAuthProvider apiUrl="https://api.example.com" apiKey="key">
      {children}
    </SentinelAuthProvider>
  );
}

describe("SentinelAuthRegisterFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws if used outside a SentinelAuthProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<SentinelAuthRegisterFlow />)).toThrow(
      "must be used within a <SentinelAuthProvider>"
    );
    spy.mockRestore();
  });

  it("renders the underlying custom element once registered", async () => {
    const { container } = renderWithProvider(<SentinelAuthRegisterFlow />);
    await waitFor(() => {
      expect(container.querySelector("sentinel-auth-register-flow")).toBeTruthy();
    });
  });

  it("calls onSuccess with { email, response } when sentinel-register-complete fires", async () => {
    const onSuccess = vi.fn();
    const { container } = renderWithProvider(
      <SentinelAuthRegisterFlow onSuccess={onSuccess} />
    );

    let el: Element | null = null;
    await waitFor(() => {
      el = container.querySelector("sentinel-auth-register-flow");
      expect(el).toBeTruthy();
    });

    el!.dispatchEvent(
      new CustomEvent("sentinel-register-complete", {
        detail: { email: "new@example.com", response: { message: "verified" } },
      })
    );

    expect(onSuccess).toHaveBeenCalledWith({
      email: "new@example.com",
      response: { message: "verified" },
    });
  });

  it("cleans up its event listener on unmount", async () => {
    const onSuccess = vi.fn();
    const { container, unmount } = renderWithProvider(
      <SentinelAuthRegisterFlow onSuccess={onSuccess} />
    );

    let el: Element | null = null;
    await waitFor(() => {
      el = container.querySelector("sentinel-auth-register-flow");
      expect(el).toBeTruthy();
    });

    unmount();

    el!.dispatchEvent(
      new CustomEvent("sentinel-register-complete", {
        detail: { email: "new@example.com", response: { message: "verified" } },
      })
    );

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("does not crash if onSuccess is not provided", async () => {
    const { container } = renderWithProvider(<SentinelAuthRegisterFlow />);

    let el: Element | null = null;
    await waitFor(() => {
      el = container.querySelector("sentinel-auth-register-flow");
      expect(el).toBeTruthy();
    });

    expect(() => {
      el!.dispatchEvent(
        new CustomEvent("sentinel-register-complete", {
          detail: { email: "new@example.com", response: { message: "verified" } },
        })
      );
    }).not.toThrow();
  });
});