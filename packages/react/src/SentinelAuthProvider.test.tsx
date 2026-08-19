import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook } from "@testing-library/react";
import { SentinelAuthProvider } from "./SentinelAuthProvider.js";
import { useSentinelAuth } from "./useSentinelAuth.js";
import { SentinelAuth } from "@sentinelauth/sdk";

vi.mock("@sentinelauth/sdk", () => {
  const mockInstance = {
    register: vi.fn(),
    login: vi.fn(),
    getAccessToken: vi.fn(),
  };
  return {
    SentinelAuth: vi.fn().mockImplementation(() => mockInstance),
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SentinelAuthProvider apiUrl="https://api.example.com" apiKey="key">
      {children}
    </SentinelAuthProvider>
  );
}

describe("SentinelAuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children", () => {
    const { getByText } = render(
      <SentinelAuthProvider apiUrl="https://api.example.com" apiKey="key">
        <div>child content</div>
      </SentinelAuthProvider>
    );

    expect(getByText("child content")).toBeTruthy();
  });
  it("provides the same SDK instance across re-renders (does not recreate)", () => {
    const { rerender } = renderHook(() => useSentinelAuth(), { wrapper });
    rerender();
    rerender();

    // SentinelAuth constructor should only ever be called ONCE across
    // all three renders -- proves the useMemo isn't recreating the
    // instance and silently dropping session state.
    expect(SentinelAuth).toHaveBeenCalledTimes(1);
  });
});

describe("useSentinelAuth", () => {
  it("throws a clear error when used outside a provider", () => {
    // Suppress React's expected console.error for this negative case
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => renderHook(() => useSentinelAuth())).toThrow(
      "useSentinelAuth() must be used within a <SentinelAuthProvider>."
    );

    spy.mockRestore();
  });

  it("exposes every method as a callable function", () => {
    const { result } = renderHook(() => useSentinelAuth(), { wrapper });

    expect(typeof result.current.register).toBe("function");
    expect(typeof result.current.login).toBe("function");
    expect(typeof result.current.logout).toBe("function");
    expect(typeof result.current.refresh).toBe("function");
    expect(typeof result.current.forgotPassword).toBe("function");
    expect(typeof result.current.resetPassword).toBe("function");
    expect(typeof result.current.setupMfa).toBe("function");
    expect(typeof result.current.enableMfa).toBe("function");
    expect(typeof result.current.disableMfa).toBe("function");
    expect(typeof result.current.verifyMfa).toBe("function");
    expect(typeof result.current.verifyEmail).toBe("function");
  });

  it("exposes the raw sdk instance as an escape hatch", () => {
    const { result } = renderHook(() => useSentinelAuth(), { wrapper });

    expect(result.current.sdk).toBeTruthy();
  });

  it("calling login() delegates to the underlying SDK instance", async () => {
    const { result } = renderHook(() => useSentinelAuth(), { wrapper });

    await result.current.login("user@example.com", "password123");

    expect(result.current.sdk.login).toHaveBeenCalledWith(
      "user@example.com",
      "password123"
    );
  });

  it("returned functions are referentially stable across re-renders", () => {
    const { result, rerender } = renderHook(() => useSentinelAuth(), {
      wrapper,
    });

    const firstLogin = result.current.login;
    rerender();
    const secondLogin = result.current.login;

    expect(firstLogin).toBe(secondLogin);
  });
});
