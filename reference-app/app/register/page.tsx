"use client";
import { SentinelAuthRegisterFlow } from "@sentinelauth/react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  return (
    <main style={{ maxWidth: 400, margin: "4rem auto" }}>
      <h1>Create an account</h1>
      <SentinelAuthRegisterFlow onSuccess={() => router.push("/login")} />
    </main>
  );
}
