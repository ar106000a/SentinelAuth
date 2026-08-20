import { useEffect, useRef } from "react";
import { useSentinelAuth } from "./useSentinelAuth.js";
import { useRegisterComponents } from "./useRegisterComponents.js";
import type { SentinelAuthMfaDisableElement } from "@sentinelauth/sdk/components";

export interface SentinelAuthMfaDisableProps {
  onSuccess?: (result: { message: string }) => void;
  onError?: (error: { message: string }) => void;
}

export function SentinelAuthMfaDisable({
  onSuccess,
  onError,
}: SentinelAuthMfaDisableProps) {
  const { sdk } = useSentinelAuth();
  const registered = useRegisterComponents();
  const elementRef = useRef<SentinelAuthMfaDisableElement | null>(null);

  useEffect(() => {
    if (!registered) return;
    const el = elementRef.current;
    if (!el) return;

    el.setSdk(sdk);

    const handleComplete = (e: Event) => {
      onSuccess?.((e as CustomEvent<{ message: string }>).detail);
    };

    // mfa-disable DOES dispatch a dedicated error event
    // (sentinel-mfa-disable-error, SENT-1142) -- unlike every other
    // component wrapped so far, onError has a real event to attach to
    // here, not just interface symmetry.
    const handleError = (e: Event) => {
      onError?.((e as CustomEvent<{ message: string }>).detail);
    };

    el.addEventListener("sentinel-mfa-disable-complete", handleComplete);
    el.addEventListener("sentinel-mfa-disable-error", handleError);

    return () => {
      el.removeEventListener("sentinel-mfa-disable-complete", handleComplete);
      el.removeEventListener("sentinel-mfa-disable-error", handleError);
    };
  }, [registered, sdk, onSuccess, onError]);

  if (!registered) {
    return null;
  }

  // @ts-expect-error custom element not in JSX.IntrinsicElements
  return <sentinel-auth-mfa-disable ref={elementRef} />;
}
