import { useEffect, useState } from "react";

let registrationPromise: Promise<void> | null = null;

/**
 * Dynamically imports @sentinelauth/sdk/components exactly once,
 * shared across every wrapped component instance on a page, and
 * returns whether registration has completed.
 *
 * This exists specifically to solve the SSR crash discovered the
 * hard way in Week 9's sample-app integration testing: the SDK's
 * custom element classes extend HTMLElement, a browser-only global.
 * A top-level import of that module during Next.js's server-side
 * module graph construction crashes immediately, regardless of
 * useEffect/dynamic() guards applied to the *consuming* component --
 * only importing the module itself from inside a useEffect (guaranteed
 * client-only execution) avoids it.
 *
 * The module-level `registrationPromise` (not component state) means
 * ten wrapped components on the same page share ONE import + one
 * registration pass, not ten independent ones each re-triggering the
 * dynamic import.
 */
export function useRegisterComponents(): boolean {
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!registrationPromise) {
      registrationPromise = import("@sentinelauth/sdk/components").then(() => {});
    }

    registrationPromise.then(() => {
      if (!cancelled) setRegistered(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return registered;
}