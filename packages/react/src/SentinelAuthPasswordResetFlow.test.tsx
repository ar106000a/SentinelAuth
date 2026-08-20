import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { SentinelAuthProvider } from "./SentinelAuthProvider.js";
import { SentinelAuthPasswordResetFlow } from "./SentinelAuthPasswordResetFlow.js";

vi.mock("@sentinelauth/sdk", () => {
  const mockInstance = { forgotPassword: vi.fn(), resetPassword: vi.fn() };
  return { SentinelAuth: vi.fn().mockImplementation(() => mockInstance) };
});

vi.mock("@sentinelauth/sdk/components", () => {
  if (!customElements.get("sentinel-auth-password-reset-flow")) {
    class FakeResetFlow extends HTMLElement {
      setSdk() {}
    }
    customElements.define("sentinel-auth-password-reset-flow", FakeResetFlow);
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

describe("SentinelAuthPasswordResetFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws if used outside a SentinelAuthProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<SentinelAuthPasswordResetFlow />)).toThrow(
      "must be used within a <SentinelAuthProvider>"
    );
    spy.mockRestore();
  });

  it("renders the underlying custom element once registered", async () => {
    const { container } = renderWithProvider(<SentinelAuthPasswordResetFlow />);
    await waitFor(() => {
      expect(
        container.querySelector("sentinel-auth-password-reset-flow")
      ).toBeTruthy();
    });
  });

  it("calls onSuccess when sentinel-password-reset-complete fires", async () => {
    const onSuccess = vi.fn();
    const { container } = renderWithProvider(
      <SentinelAuthPasswordResetFlow onSuccess={onSuccess} />
    );

    let el: Element | null = null;
    await waitFor(() => {
      el = container.querySelector("sentinel-auth-password-reset-flow");
      expect(el).toBeTruthy();
    });

    el!.dispatchEvent(
      new CustomEvent("sentinel-password-reset-complete", {
        detail: {
          email: "user@example.com",
          message: "Password reset successfully.",
        },
      })
    );

    expect(onSuccess).toHaveBeenCalledWith({
      email: "user@example.com",
      message: "Password reset successfully.",
    });
  });

  it("cleans up its event listener on unmount", async () => {
    const onSuccess = vi.fn();
    const { container, unmount } = renderWithProvider(
      <SentinelAuthPasswordResetFlow onSuccess={onSuccess} />
    );

    let el: Element | null = null;
    await waitFor(() => {
      el = container.querySelector("sentinel-auth-password-reset-flow");
      expect(el).toBeTruthy();
    });

    unmount();

    el!.dispatchEvent(
      new CustomEvent("sentinel-password-reset-complete", {
        detail: { email: "user@example.com", message: "reset" },
      })
    );

    expect(onSuccess).not.toHaveBeenCalled();
  });
});
