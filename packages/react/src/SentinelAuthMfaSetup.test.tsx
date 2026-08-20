// packages/react/src/SentinelAuthMfaSetup.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRef } from "react";
import { render, waitFor } from "@testing-library/react";
import { SentinelAuthProvider } from "./SentinelAuthProvider.js";
import {
  SentinelAuthMfaSetup,
  type SentinelAuthMfaSetupHandle,
} from "./SentinelAuthMfaSetup.js";

vi.mock("@sentinelauth/sdk", () => {
  const mockInstance = { setupMfa: vi.fn(), enableMfa: vi.fn(), getAccessToken: vi.fn() };
  return { SentinelAuth: vi.fn().mockImplementation(() => mockInstance) };
});

vi.mock("@sentinelauth/sdk/components", () => {
  if (!customElements.get("sentinel-auth-mfa-setup")) {
    class FakeMfaSetup extends HTMLElement {
      setSdk() {}
      start = vi.fn().mockResolvedValue(undefined);
    }
    customElements.define("sentinel-auth-mfa-setup", FakeMfaSetup);
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

describe("SentinelAuthMfaSetup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the underlying custom element once registered", async () => {
    const { container } = renderWithProvider(<SentinelAuthMfaSetup />);
    await waitFor(() => {
      expect(container.querySelector("sentinel-auth-mfa-setup")).toBeTruthy();
    });
  });

  it("does NOT call start() automatically on mount", async () => {
    const { container } = renderWithProvider(<SentinelAuthMfaSetup />);

    let el: any;
    await waitFor(() => {
      el = container.querySelector("sentinel-auth-mfa-setup");
      expect(el).toBeTruthy();
    });

    expect(el.start).not.toHaveBeenCalled();
  });

  it("exposes start() via ref, calling through to the underlying element", async () => {
    const ref = createRef<SentinelAuthMfaSetupHandle>();
    const { container } = renderWithProvider(<SentinelAuthMfaSetup ref={ref} />);

    let el: any;
    await waitFor(() => {
      el = container.querySelector("sentinel-auth-mfa-setup");
      expect(el).toBeTruthy();
    });

    await ref.current?.start();

    expect(el.start).toHaveBeenCalledTimes(1);
  });

  it("calls onSuccess when sentinel-mfa-setup-complete fires", async () => {
    const onSuccess = vi.fn();
    const { container } = renderWithProvider(
      <SentinelAuthMfaSetup onSuccess={onSuccess} />
    );

    let el: Element | null = null;
    await waitFor(() => {
      el = container.querySelector("sentinel-auth-mfa-setup");
      expect(el).toBeTruthy();
    });

    el!.dispatchEvent(new CustomEvent("sentinel-mfa-setup-complete"));

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("cleans up its event listener on unmount", async () => {
    const onSuccess = vi.fn();
    const { container, unmount } = renderWithProvider(
      <SentinelAuthMfaSetup onSuccess={onSuccess} />
    );

    let el: Element | null = null;
    await waitFor(() => {
      el = container.querySelector("sentinel-auth-mfa-setup");
      expect(el).toBeTruthy();
    });

    unmount();

    el!.dispatchEvent(new CustomEvent("sentinel-mfa-setup-complete"));

    expect(onSuccess).not.toHaveBeenCalled();
  });
});