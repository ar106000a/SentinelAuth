// packages/react/src/SentinelAuthLogoutButton.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { SentinelAuthProvider } from "./SentinelAuthProvider.js";
import { SentinelAuthLogoutButton } from "./SentinelAuthLogoutButton.js";

vi.mock("@sentinelauth/sdk", () => {
  const mockInstance = { logout: vi.fn(), getAccessToken: vi.fn() };
  return { SentinelAuth: vi.fn().mockImplementation(() => mockInstance) };
});

vi.mock("@sentinelauth/sdk/components", () => {
  if (!customElements.get("sentinel-auth-logout-button")) {
    class FakeLogout extends HTMLElement {
      setSdk() {}
    }
    customElements.define("sentinel-auth-logout-button", FakeLogout);
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

describe("SentinelAuthLogoutButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the underlying custom element once registered", async () => {
    const { container } = renderWithProvider(<SentinelAuthLogoutButton />);
    await waitFor(() => {
      expect(
        container.querySelector("sentinel-auth-logout-button")
      ).toBeTruthy();
    });
  });

  it("calls onSuccess with the message on sentinel-logout-complete", async () => {
    const onSuccess = vi.fn();
    const { container } = renderWithProvider(
      <SentinelAuthLogoutButton onSuccess={onSuccess} />
    );

    let el: Element | null = null;
    await waitFor(() => {
      el = container.querySelector("sentinel-auth-logout-button");
      expect(el).toBeTruthy();
    });

    el!.dispatchEvent(
      new CustomEvent("sentinel-logout-complete", {
        detail: { message: "Logged out" },
      })
    );

    expect(onSuccess).toHaveBeenCalledWith({ message: "Logged out" });
  });

  it("calls onError on sentinel-logout-error — logout must never fail silently (SENT-1143 req #6)", async () => {
    const onError = vi.fn();
    const { container } = renderWithProvider(
      <SentinelAuthLogoutButton onError={onError} />
    );

    let el: Element | null = null;
    await waitFor(() => {
      el = container.querySelector("sentinel-auth-logout-button");
      expect(el).toBeTruthy();
    });

    el!.dispatchEvent(
      new CustomEvent("sentinel-logout-error", {
        detail: { message: "Network request failed" },
      })
    );

    expect(onError).toHaveBeenCalledWith({ message: "Network request failed" });
  });

  it("cleans up both event listeners on unmount", async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { container, unmount } = renderWithProvider(
      <SentinelAuthLogoutButton onSuccess={onSuccess} onError={onError} />
    );

    let el: Element | null = null;
    await waitFor(() => {
      el = container.querySelector("sentinel-auth-logout-button");
      expect(el).toBeTruthy();
    });

    unmount();

    el!.dispatchEvent(
      new CustomEvent("sentinel-logout-complete", { detail: { message: "x" } })
    );
    el!.dispatchEvent(
      new CustomEvent("sentinel-logout-error", { detail: { message: "y" } })
    );

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
