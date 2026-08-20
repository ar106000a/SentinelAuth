import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useSentinelAuth } from "./useSentinelAuth.js";
import { useRegisterComponents } from "./useRegisterComponents.js";
import type { SentinelAuthMfaSetupElement } from "@sentinelauth/sdk/components";

export interface SentinelAuthMfaSetupProps {
  onSuccess?: () => void;
  onError?: (error: { message: string }) => void;
}

/** Imperative handle exposed via ref — mirrors the underlying Web
 * Component's own start() method, which is deliberately NOT
 * auto-triggered on mount (Week 12 design: firing an API call the
 * instant a DOM node is created is surprising, uncontrollable
 * behavior for whatever's hosting it). A consumer decides when
 * setup begins, e.g. a settings-page button:
 *
 *   const setupRef = useRef<SentinelAuthMfaSetupHandle>(null);
 *   <SentinelAuthMfaSetup ref={setupRef} onSuccess={...} />
 *   <button onClick={() => setupRef.current?.start()}>Enable MFA</button>
 */
export interface SentinelAuthMfaSetupHandle {
  start: () => Promise<void>;
}

export const SentinelAuthMfaSetup = forwardRef<
  SentinelAuthMfaSetupHandle,
  SentinelAuthMfaSetupProps
>(function SentinelAuthMfaSetup({ onSuccess, onError }, forwardedRef) {
  const { sdk } = useSentinelAuth();
  const registered = useRegisterComponents();
  const elementRef = useRef<SentinelAuthMfaSetupElement | null>(null);

  useImperativeHandle(
    forwardedRef,
    () => ({
      start: async () => {
        await elementRef.current?.start();
      },
    }),
    // elementRef.current itself isn't a dependency -- this handle's
    // closure calls through the ref at invocation time, not at
    // creation time, so it always reaches whatever element currently
    // exists rather than needing to be recreated when the element
    // mounts/unmounts.
    []
  );

  useEffect(() => {
    if (!registered) return;
    const el = elementRef.current;
    if (!el) return;

    el.setSdk(sdk);

    const handleComplete = () => {
      onSuccess?.();
    };

    el.addEventListener("sentinel-mfa-setup-complete", handleComplete);

    return () => {
      el.removeEventListener("sentinel-mfa-setup-complete", handleComplete);
    };
  }, [registered, sdk, onSuccess, onError]);

  if (!registered) {
    return null;
  }

  // @ts-expect-error custom element not in JSX.IntrinsicElements
  return <sentinel-auth-mfa-setup ref={elementRef} />;
});
