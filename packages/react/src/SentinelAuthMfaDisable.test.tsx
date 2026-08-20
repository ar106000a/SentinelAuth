// packages/react/src/SentinelAuthMfaDisable.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { SentinelAuthProvider } from "./SentinelAuthProvider.js";
import { SentinelAuthMfaDisable } from "./SentinelAuthMfaDisable.js";

vi.mock("@sentinelauth/sdk", () => {
  const mockInstance = { disableMfa: vi.fn(), getAccessToken: vi.fn() };
  return { SentinelAuth: vi.fn().mockImplementation(() => mockInstance) };
});

vi.mock("@sentinelauth/sdk/components", () => {
  if (!customElements.get("sentinel-auth-mfa-disable")) {
    class FakeMfaDisable extends HTMLElement {
      setSdk() {}
    }
    customElements.define("sentinel-auth-mfa-disable", FakeMfaDisable);
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

describe("SentinelAuthMfaDisable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the underlying custom element once registered", async () => {
    const { container } = renderWithProvider(<SentinelAuthMfaDisable />);
    await waitFor(() => {
      expect(container.querySelector("sentinel-auth-mfa-disable")).toBeTruthy();
    });
  });

  it("calls onSuccess with the message on sentinel-mfa-disable-complete", async () => {
    const onSuccess = vi.fn();
    const { container } = renderWithProvider(
      <SentinelAuthMfaDisable onSuccess={onSuccess} />
    );

    let el: Element | null = null;
    await waitFor(() => {
      el = container.querySelector("sentinel-auth-mfa-disable");
      expect(el).toBeTruthy();
    });

    el!.dispatchEvent(
      new CustomEvent("sentinel-mfa-disable-complete", {
        detail: { message: "MFA disabled successfully" },
      })
    );

    expect(onSuccess).toHaveBeenCalledWith({ message: "MFA disabled successfully" });
  });

  it("calls onError with the message on sentinel-mfa-disable-error — the first REAL error wiring in this package", async () => {
    const onError = vi.fn();
    const { container } = renderWithProvider(
      <SentinelAuthMfaDisable onError={onError} />
    );

    let el: Element | null = null;
    await waitFor(() => {
      el = container.querySelector("sentinel-auth-mfa-disable");
      expect(el).toBeTruthy();
    });

    el!.dispatchEvent(
      new CustomEvent("sentinel-mfa-disable-error", {
        detail: { message: "Invalid password" },
      })
    );

    expect(onError).toHaveBeenCalledWith({ message: "Invalid password" });
  });

  it("cleans up BOTH event listeners on unmount", async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { container, unmount } = renderWithProvider(
      <SentinelAuthMfaDisable onSuccess={onSuccess} onError={onError} />
    );

    let el: Element | null = null;
    await waitFor(() => {
      el = container.querySelector("sentinel-auth-mfa-disable");
      expect(el).toBeTruthy();
    });

    unmount();

    el!.dispatchEvent(
      new CustomEvent("sentinel-mfa-disable-complete", { detail: { message: "x" } })
    );
    el!.dispatchEvent(
      new CustomEvent("sentinel-mfa-disable-error", { detail: { message: "y" } })
    );

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});