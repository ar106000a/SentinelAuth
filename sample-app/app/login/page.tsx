"use client";

import { useEffect, useRef, useState } from "react";
import { SentinelAuth } from "@sentinelauth/sdk";

const sdk = new SentinelAuth({
  apiUrl: "http://localhost:3000",
  apiKey: "bcbaa755da0360929a90799f3eefa08f48dc2fe42ab3c4620a344353ee5f1515", // note: renamed from publicKey last week
});

export default function LoginPage() {
  const flowRef = useRef<any>(null);
  const passwordResetRef = useRef<any>(null);
  const registerFlowRef = useRef<any>(null);
  const logoutRef = useRef<any>(null);
  const mfaSetupRef = useRef<any>(null);
  const mfaDisableRef = useRef<any>(null);
  const [result, setResult] = useState<string | null>(null);
  const [componentsRegistered, setComponentsRegistered] = useState(false);

  // Captured from a successful login, used to feed setAccessToken()
  // on the MFA/logout components below. Manual wiring — a real
  // settings page would source this from wherever the tenant stores
  // tokens post-login (out of scope for this test harness).
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@sentinelauth/sdk/components").then(() => {
      if (!cancelled) setComponentsRegistered(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!componentsRegistered) return;

    flowRef.current?.setSdk(sdk);
    registerFlowRef.current?.setSdk(sdk);

    const handleLoginComplete = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setResult(JSON.stringify((e as CustomEvent).detail, null, 2));

      if (detail?.accessToken) {
        setAccessToken(detail.accessToken);
      }
    };
    const handleRegisterComplete = (e: Event) => {
      setResult(JSON.stringify((e as CustomEvent).detail, null, 2));
    };

    passwordResetRef.current?.setSdk(sdk);

    const handleResetComplete = (e: Event) => {
      setResult(JSON.stringify((e as CustomEvent).detail, null, 2));
    };

    logoutRef.current?.setSdk(sdk);
    mfaSetupRef.current?.setSdk(sdk);
    mfaDisableRef.current?.setSdk(sdk);

    const handleLogoutComplete = (e: Event) => {
      setResult(JSON.stringify((e as CustomEvent).detail, null, 2));
      setAccessToken(null); // old token is dead — clear it from the harness
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

    passwordResetRef.current?.addEventListener(
      "sentinel-password-reset-complete",
      handleResetComplete
    );

    flowRef.current?.addEventListener(
      "sentinel-auth-complete",
      handleLoginComplete
    );
    registerFlowRef.current?.addEventListener(
      "sentinel-register-complete",
      handleRegisterComplete
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
      passwordResetRef.current?.removeEventListener(
        "sentinel-password-reset-complete",
        handleResetComplete
      );
      flowRef.current?.removeEventListener(
        "sentinel-auth-complete",
        handleLoginComplete
      );
      registerFlowRef.current?.removeEventListener(
        "sentinel-register-complete",
        handleRegisterComplete
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

  useEffect(() => {
    if (!componentsRegistered || !accessToken) return;
    mfaSetupRef.current?.setAccessToken(accessToken);
    mfaDisableRef.current?.setAccessToken(accessToken);
    logoutRef.current?.setAccessToken(accessToken);
  }, [componentsRegistered, accessToken]);

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
        <p style={{ fontSize: "0.8rem", color: "#6b7280" }}>
          {accessToken
            ? "Access token captured — logout is armed."
            : "Log in first to arm this."}
        </p>
        {componentsRegistered && (
          // @ts-expect-error custom element not in JSX.IntrinsicElements
          <sentinel-auth-logout-button ref={logoutRef} />
        )}

        <h2 style={{ marginTop: "2rem" }}>MFA setup</h2>
        <p style={{ fontSize: "0.8rem", color: "#6b7280" }}>
          {accessToken
            ? "Access token captured — click below to start."
            : "Log in first to arm this."}
        </p>
        {componentsRegistered && (
          <>
            {/* @ts-expect-error custom element not in JSX.IntrinsicElements */}
            <sentinel-auth-mfa-setup ref={mfaSetupRef} />
            <button
              onClick={() => mfaSetupRef.current?.start()}
              disabled={!accessToken}
              style={{ marginTop: "0.5rem" }}
            >
              Start MFA setup
            </button>
          </>
        )}

        <h2 style={{ marginTop: "2rem" }}>MFA disable</h2>
        <p style={{ fontSize: "0.8rem", color: "#6b7280" }}>
          {accessToken ? "Access token captured." : "Log in first to arm this."}
        </p>
        {componentsRegistered && (
          // @ts-expect-error custom element not in JSX.IntrinsicElements
          <sentinel-auth-mfa-disable ref={mfaDisableRef} />
        )}
      </div>

      {result && (
        <pre
          style={{ marginTop: "2rem", background: "#f3f4f6", padding: "1rem" }}
        >
          {result}
        </pre>
      )}
    </main>
  );
}
