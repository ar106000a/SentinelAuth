import {  useEffect, useRef } from "react";
import { useRegisterComponents } from "./useRegisterComponents.js";
import type { SentinelAuthRegisterFlowElement } from "@sentinelauth/sdk/components";
import type { UserVerifyEmailResponse } from "@sentinelauth/types";
import { useSentinelAuth } from "./useSentinelAuth.js";

export interface SentinelAuthRegisterFlowProps {
  onSuccess?: (result: { email: string; response: UserVerifyEmailResponse }) => void;
  onError?: (error: { message: string }) => void;
}

export function SentinelAuthRegisterFlow({
  onSuccess,
  onError,
}: SentinelAuthRegisterFlowProps) {
  const {sdk} = useSentinelAuth();
  const registered = useRegisterComponents();
  const elementRef = useRef<SentinelAuthRegisterFlowElement | null>(null);

  useEffect(() => {
      const el = elementRef.current;
    if (!registered || !el) return;

    el.setSdk(sdk);

    const handleComplete = (e: Event) => {
      onSuccess?.(
        (e as CustomEvent<{ email: string; response: UserVerifyEmailResponse }>).detail
      );
    };

    // sentinel-register-flow, like sentinel-auth-flow, has no dedicated
    // top-level error event -- failures surface inline on the
    // register-form/otp-input children. onError kept for interface
    // symmetry across every wrapped component in this package (same
    // reasoning as Tuesday's SentinelAuthLoginFlow).
    el.addEventListener("sentinel-register-complete", handleComplete);

    return () => {
      el.removeEventListener("sentinel-register-complete", handleComplete);
    };
  }, [registered, sdk, onSuccess, onError]);

  if (!registered) {
    return null;
  }

  // @ts-expect-error custom element not in JSX.IntrinsicElements
  return <sentinel-auth-register-flow ref={elementRef} />;
}