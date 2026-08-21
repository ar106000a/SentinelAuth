import { useEffect, useRef } from "react";
import { useSentinelAuth } from "./useSentinelAuth.js";
import { useRegisterComponents } from "./useRegisterComponents.js";
import type { SentinelAuthLogoutElement } from "@sentinelauth/sdk/components";

export interface SentinelAuthLogoutButtonProps {
  onSuccess?: (result: { message: string }) => void;
  onError?: (error: { message: string }) => void;
}

export function SentinelAuthLogoutButton({
  onSuccess,
  onError,
}: SentinelAuthLogoutButtonProps) {
  const { sdk } = useSentinelAuth();
  const registered = useRegisterComponents();
  const elementRef = useRef<SentinelAuthLogoutElement | null>(null);

  useEffect(() => {
    if (!registered) return;
    const el = elementRef.current;
    if (!el) return;

    el.setSdk(sdk);

    const handleComplete = (e: Event) => {
      onSuccess?.((e as CustomEvent<{ message: string }>).detail);
    };

    // sentinel-auth-logout-button dispatches a real error event
    // (SENT-1143 requirement #6: "don't fail silently") -- same
    // genuine wiring as yesterday's mfa-disable, not interface
    // symmetry carried forward unused.
    const handleError = (e: Event) => {
      onError?.((e as CustomEvent<{ message: string }>).detail);
    };

    el.addEventListener("sentinel-logout-complete", handleComplete);
    el.addEventListener("sentinel-logout-error", handleError);

    return () => {
      el.removeEventListener("sentinel-logout-complete", handleComplete);
      el.removeEventListener("sentinel-logout-error", handleError);
    };
  }, [registered, sdk, onSuccess, onError]);

  if (!registered) {
    return null;
  }

  // @ts-expect-error custom element not in JSX.IntrinsicElements
  return <sentinel-auth-logout-button ref={elementRef} />;
}