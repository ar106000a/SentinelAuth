"use client";

import { useEffect, useRef, useState } from "react";
import { SentinelAuth } from "@sentinelauth/sdk";

const sdk = new SentinelAuth({
  apiUrl: "http://localhost:3000",
  apiKey: "bcbaa755da0360929a90799f3eefa08f48dc2fe42ab3c4620a344353ee5f1515",
});

export default function LoginPage() {
  const flowRef = useRef<any>(null);
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
    if (!componentsRegistered || !flowRef.current) return;

    flowRef.current.setSdk(sdk);

    const handleComplete = (e: Event) => {
      setResult(JSON.stringify((e as CustomEvent).detail, null, 2));
    };
    flowRef.current.addEventListener("sentinel-auth-complete", handleComplete);
    return () =>
      flowRef.current?.removeEventListener(
        "sentinel-auth-complete",
        handleComplete
      );
  }, [componentsRegistered]);

  return (
    <main
      style={{ maxWidth: 400, margin: "4rem auto", fontFamily: "system-ui" }}
    >
      <h1>Sample Tenant App</h1>
      <div
        style={{
          // @ts-expect-error CSS custom properties aren't in React's CSSProperties type
          "--sentinel-primary-color": "#7c3aed",
          "--sentinel-border-radius": "12px",
        }}
      >
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
    </main>
  );
}
