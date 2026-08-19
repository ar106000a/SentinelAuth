import { useContext, useEffect, useRef } from "react";
import { SentinelAuthContext } from "./SentinelAuthProvider.js";
import { useRegisterComponents } from "./useRegisterComponents.js";
import type { LoginResponse, MfaVerifyResponse } from "@sentinelauth/types";

export interface SentinelAuthLoginFlowProps {
  /** Called when login completes fully -- whether or not MFA was involved.
   * Mirrors the underlying component's unified sentinel-auth-complete
   * event (Week 9 design: tenants shouldn't need to care which path
   * was taken, only that authentication finished). */
  onSuccess?: (result: LoginResponse | MfaVerifyResponse) => void;
  onError?: (error: { message: string }) => void;
}

export function SentinelAuthLoginFlow({
  onSuccess,
  onError,
}: SentinelAuthLoginFlowProps) {
  const sdk = useContext(SentinelAuthContext);
  const registered = useRegisterComponents();
  const elementRef = useRef<any>(null);

  if (!sdk) {
    throw new Error(
      "<SentinelAuthLoginFlow> must be used within a <SentinelAuthProvider>."
    );
  }

  useEffect(() => {
    const el = elementRef.current;
    if (!registered || !el) return;

    el.setSdk(sdk);

    const handleComplete = (e: Event) => {
      onSuccess?.((e as CustomEvent<LoginResponse | MfaVerifyResponse>).detail);
    };

    const handleError = (e: Event) => {
      onError?.((e as CustomEvent<{ message: string }>).detail);
    };

    // sentinel-auth-flow only actually dispatches -complete on either
    // path (login-only success, or MFA-completed success) -- there's
    // no separate top-level error event on the orchestrator itself
    // (Week 9 design: errors surface inline on the login-form/otp-input
    // children, not bubbled to a flow-level error event). Wiring
    // handleError here is a forward-looking no-op today, kept for
    // interface symmetry with components that DO emit one (Wednesday's
    // MFA setup wrapper will actually use it).
    elementRef.current.addEventListener(
      "sentinel-auth-complete",
      handleComplete
    );

    return () => {
      el.removeEventListener("sentinel-auth-complete", handleComplete);
    };
  }, [registered, sdk, onSuccess, onError]);

  if (!registered) {
    return null;
  }

  // @ts-expect-error custom element not in JSX.IntrinsicElements --
  // suppressed HERE, once, inside the package. No tenant ever sees
  // this comment or needs to write it themselves.
  return <sentinel-auth-flow ref={elementRef} />;
}
