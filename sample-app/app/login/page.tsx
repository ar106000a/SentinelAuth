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

  useEffect(() => {
    if (!componentsRegistered) return;

    flowRef.current?.setSdk(sdk);
    registerFlowRef.current?.setSdk(sdk);

    const handleLoginComplete = (e: Event) => {
      setResult(JSON.stringify((e as CustomEvent).detail, null, 2));
    };
    const handleRegisterComplete = (e: Event) => {
      setResult(JSON.stringify((e as CustomEvent).detail, null, 2));
    };

    passwordResetRef.current?.setSdk(sdk);

    const handleResetComplete = (e: Event) => {
      setResult(JSON.stringify((e as CustomEvent).detail, null, 2));
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
      </div>

      {result && (
        <pre
          style={{ marginTop: "2rem", background: "#f3f4f6", padding: "1rem" }}
        >
          {result}
        </pre>
      )}

      <h2 style={{ marginTop: "2rem" }}>Forgot password</h2>
      {componentsRegistered && (
        // @ts-expect-error custom element not in JSX.IntrinsicElements
        <sentinel-auth-password-reset-flow ref={passwordResetRef} />
      )}
    </main>
  );
}
