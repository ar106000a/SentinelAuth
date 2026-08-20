import { useEffect, useRef } from "react";
import { useRegisterComponents } from "./useRegisterComponents.js";
import type { SentinelAuthPasswordResetFlowElement } from "@sentinelauth/sdk/components";
import { useSentinelAuth } from "./useSentinelAuth.js";

export interface SentinelAuthPasswordResetFlowProps {
  onSuccess?: (result: { email: string; message: string }) => void;
  onError?: (error: { message: string }) => void;
}

export function SentinelAuthPasswordResetFlow({
  onSuccess,
  onError,
}: SentinelAuthPasswordResetFlowProps) {
  const { sdk } = useSentinelAuth();
  const registered = useRegisterComponents();
  const elementRef = useRef<SentinelAuthPasswordResetFlowElement | null>(null);

  useEffect(() => {
    const el = elementRef.current;
    if (!registered || !el) return;

    el.setSdk(sdk);

    const handleComplete = (e: Event) => {
      onSuccess?.(
        (e as CustomEvent<{ email: string; message: string }>).detail
      );
    };

    el.addEventListener("sentinel-password-reset-complete", handleComplete);

    return () => {
      el.removeEventListener(
        "sentinel-password-reset-complete",
        handleComplete
      );
    };
  }, [registered, sdk, onSuccess, onError]);

  if (!registered) {
    return null;
  }

  // @ts-expect-error custom element not in JSX.IntrinsicElements
  return <sentinel-auth-password-reset-flow ref={elementRef} />;
}
