"use client";
import { SentinelAuthPasswordResetFlow } from "@sentinelauth/react";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const router = useRouter();
  return (
    <main style={{ maxWidth: 400, margin: "4rem auto" }}>
      <h1>Reset your password</h1>
      <SentinelAuthPasswordResetFlow onSuccess={() => router.push("/login")} />
    </main>
  );
}
