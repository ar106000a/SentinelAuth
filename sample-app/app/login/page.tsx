"use client";

import { useEffect, useRef, useState } from "react";
import { SentinelAuth } from "@sentinelauth/sdk";

const sdk = new SentinelAuth({
  apiUrl: "http://localhost:3000",
  apiKey: "bcbaa755da0360929a90799f3eefa08f48dc2fe42ab3c4620a344353ee5f1515",
});

export default function LoginPage() {
  const flowRef = useRef<any>(null);
  const registerFlowRef = useRef<any>(null);
  const passwordResetRef = useRef<any>(null);
  const logoutRef = useRef<any>(null);
  const mfaSetupRef = useRef<any>(null);
  const mfaDisableRef = useRef<any>(null);

  const [result, setResult] = useState<string | null>(null);
  const [componentsRegistered, setComponentsRegistered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("@sentinelauth/sdk/components").then(() => {
      if (!cancelled) setComponentsRegistered(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // session-expired is a top-level SentinelAuth event now (SENT-1147) --
  // fires when an automatic refresh attempt itself fails (dead/revoked
  // session). Wired once, independent of componentsRegistered, since
  // it's on the SDK instance, not a DOM element.
  useEffect(() => {
    const handleSessionExpired = () => {
      setResult(
        "SESSION EXPIRED — automatic refresh failed. Would redirect to login here."
      );
    };
    sdk.addEventListener("session-expired", handleSessionExpired);
    return () =>
      sdk.removeEventListener("session-expired", handleSessionExpired);
  }, []);

  useEffect(() => {
    if (!componentsRegistered) return;

    // setSdk() is still required on every component -- that's the
    // Shadow DOM/HTML-attribute limitation from Week 9, unrelated to
    // SENT-1147. What's GONE as of SENT-1147 is the per-component
    // setAccessToken() calls -- mfa-setup, mfa-disable, and logout now
    // pull the current token from sdk.getAccessToken() internally, at
    // call time. Nothing to wire here for that anymore.
    flowRef.current?.setSdk(sdk);
    registerFlowRef.current?.setSdk(sdk);
    passwordResetRef.current?.setSdk(sdk);
    logoutRef.current?.setSdk(sdk);
    mfaSetupRef.current?.setSdk(sdk);
    mfaDisableRef.current?.setSdk(sdk);

    const handleLoginComplete = (e: Event) => {
      setResult(JSON.stringify((e as CustomEvent).detail, null, 2));
      // No manual token capture/wiring needed anymore -- login() calls
      // sessionManager.setAccessToken() internally (SENT-1147). Every
      // component reading sdk.getAccessToken() is armed automatically
      // the instant login succeeds.
    };

    const handleRegisterComplete = (e: Event) => {
      setResult(JSON.stringify((e as CustomEvent).detail, null, 2));
    };

    const handleResetComplete = (e: Event) => {
      setResult(JSON.stringify((e as CustomEvent).detail, null, 2));
    };

    const handleLogoutComplete = (e: Event) => {
      setResult(JSON.stringify((e as CustomEvent).detail, null, 2));
    };

    const handleLogoutError = (e: Event) => {
      setResult(
        `LOGOUT ERROR:\n${JSON.stringify((e as CustomEvent).detail, null, 2)}`
      );
    };

    const handleMfaSetupComplete = (e: Event) => {
      setResult(
        `MFA ENABLED:\n${JSON.stringify((e as CustomEvent).detail, null, 2)}`
      );
    };

    const handleMfaDisableComplete = (e: Event) => {
      setResult(
        `MFA DISABLED:\n${JSON.stringify((e as CustomEvent).detail, null, 2)}`
      );
    };

    const handleMfaDisableError = (e: Event) => {
      setResult(
        `MFA DISABLE ERROR:\n${JSON.stringify((e as CustomEvent).detail, null, 2)}`
      );
    };

    flowRef.current?.addEventListener(
      "sentinel-auth-complete",
      handleLoginComplete
    );
    registerFlowRef.current?.addEventListener(
      "sentinel-register-complete",
      handleRegisterComplete
    );
    passwordResetRef.current?.addEventListener(
      "sentinel-password-reset-complete",
      handleResetComplete
    );
    logoutRef.current?.addEventListener(
      "sentinel-logout-complete",
      handleLogoutComplete
    );
    logoutRef.current?.addEventListener(
      "sentinel-logout-error",
      handleLogoutError
    );
    mfaSetupRef.current?.addEventListener(
      "sentinel-mfa-setup-complete",
      handleMfaSetupComplete
    );
    mfaDisableRef.current?.addEventListener(
      "sentinel-mfa-disable-complete",
      handleMfaDisableComplete
    );
    mfaDisableRef.current?.addEventListener(
      "sentinel-mfa-disable-error",
      handleMfaDisableError
    );

    return () => {
      flowRef.current?.removeEventListener(
        "sentinel-auth-complete",
        handleLoginComplete
      );
      registerFlowRef.current?.removeEventListener(
        "sentinel-register-complete",
        handleRegisterComplete
      );
      passwordResetRef.current?.removeEventListener(
        "sentinel-password-reset-complete",
        handleResetComplete
      );
      logoutRef.current?.removeEventListener(
        "sentinel-logout-complete",
        handleLogoutComplete
      );
      logoutRef.current?.removeEventListener(
        "sentinel-logout-error",
        handleLogoutError
      );
      mfaSetupRef.current?.removeEventListener(
        "sentinel-mfa-setup-complete",
        handleMfaSetupComplete
      );
      mfaDisableRef.current?.removeEventListener(
        "sentinel-mfa-disable-complete",
        handleMfaDisableComplete
      );
      mfaDisableRef.current?.removeEventListener(
        "sentinel-mfa-disable-error",
        handleMfaDisableError
      );
    };
  }, [componentsRegistered]);

  return (
    <main
      style={{ maxWidth: 400, margin: "4rem auto", fontFamily: "system-ui" }}
    >
      <h1>Sample Tenant App</h1>

      <div
        style={
          {
            "--sentinel-primary-color": "#7c3aed",
            "--sentinel-border-radius": "12px",
          } as any
        }
      >
        <h2>Register</h2>
        {componentsRegistered && (
          // @ts-expect-error custom element not in JSX.IntrinsicElements
          <sentinel-auth-register-flow ref={registerFlowRef} />
        )}

        <h2 style={{ marginTop: "2rem" }}>Log in</h2>
        {componentsRegistered && (
          // @ts-expect-error custom element not in JSX.IntrinsicElements
          <sentinel-auth-flow ref={flowRef} />
        )}

        <h2 style={{ marginTop: "2rem" }}>Forgot password</h2>
        {componentsRegistered && (
          // @ts-expect-error custom element not in JSX.IntrinsicElements
          <sentinel-auth-password-reset-flow ref={passwordResetRef} />
        )}

        <h2 style={{ marginTop: "2rem" }}>Logout</h2>
        {componentsRegistered && (
          // @ts-expect-error custom element not in JSX.IntrinsicElements
          <sentinel-auth-logout-button ref={logoutRef} />
        )}

        <h2 style={{ marginTop: "2rem" }}>MFA setup</h2>
        {componentsRegistered && (
          <>
            {/* @ts-expect-error custom element not in JSX.IntrinsicElements */}
            <sentinel-auth-mfa-setup ref={mfaSetupRef} />
            <button
              onClick={() => mfaSetupRef.current?.start()}
              style={{ marginTop: "0.5rem" }}
            >
              Start MFA setup
            </button>
          </>
        )}

        <h2 style={{ marginTop: "2rem" }}>MFA disable</h2>
        {componentsRegistered && (
          // @ts-expect-error custom element not in JSX.IntrinsicElements
          <sentinel-auth-mfa-disable ref={mfaDisableRef} />
        )}
      </div>

      {result && (
        <pre
          style={{
            marginTop: "2rem",
            background: "#f3f4f6",
            padding: "1rem",
            whiteSpace: "pre-wrap",
          }}
        >
          {result}
        </pre>
      )}
    </main>
  );
}
