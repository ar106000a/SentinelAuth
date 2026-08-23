"use client";
import { SentinelAuthLoginFlow } from "@sentinelauth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  return (
    <main style={{ maxWidth: 400, margin: "4rem auto" }}>
      <h1>Log in</h1>
      <SentinelAuthLoginFlow onSuccess={() => router.push("/dashboard")} />
      <a href="/forgot-password">Forgot password?</a>
    </main>
  );
}
