"use client";
import {
  SentinelAuthMfaSetup,
  SentinelAuthMfaDisable,
  SentinelAuthLogoutButton,
  useSentinelAuth,
} from "@sentinelauth/react";
import { useRef } from "react";
import type { SentinelAuthMfaSetupHandle } from "@sentinelauth/react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const { getAccessToken } = useSentinelAuth();
  const setupRef = useRef<SentinelAuthMfaSetupHandle>(null);

  return (
    <main style={{ maxWidth: 400, margin: "4rem auto" }}>
      <h1>Dashboard</h1>
      <p>Logged in: {getAccessToken() ? "yes" : "no"}</p>

      <h2>Enable MFA</h2>
      <SentinelAuthMfaSetup
        ref={setupRef}
        onSuccess={() => alert("MFA enabled")}
      />
      <button onClick={() => setupRef.current?.start()}>Start setup</button>

      <h2>Disable MFA</h2>
      <SentinelAuthMfaDisable onSuccess={() => alert("MFA disabled")} />

      <h2>Log out</h2>
      <SentinelAuthLogoutButton onSuccess={() => router.push("/login")} />
    </main>
  );
}
