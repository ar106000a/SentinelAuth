"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { SecretReveal } from "@/components/ui/SecretReveal";
import { OtpInput } from "@/components/auth/OtpInput";
import {
  verifyTenantEmail,
  ApiError,
  type TenantVerifyResult,
} from "@/lib/api";

export function VerifyEmailFlow({ email }: { email: string }) {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<TenantVerifyResult | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await verifyTenantEmail(email, otp);
      setResult(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <SecretReveal
        warning="This secret key will not be shown again. Store it in your server-side environment configuration now — not in source control."
        acknowledgeLabel="Continue to sign in"
        fields={[
          { label: "Public key", value: result.publicKey },
          { label: "Secret key", value: result.secretKey },
        ]}
        onAcknowledge={() => router.push("/login")}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-body text-[var(--color-text-secondary)]">
        We sent a 6-digit code to{" "}
        <span className="text-[var(--color-text-primary)]">{email}</span>.
      </p>

      <OtpInput value={otp} onChange={setOtp} disabled={submitting} />

      {error && (
        <p role="alert" className="text-caption text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={submitting || otp.length !== 6}
      >
        {submitting ? "Verifying…" : "Verify email"}
      </Button>

      <p className="text-caption text-center">
        Didn&apos;t get a code? Check spam — resend isn&apos;t available yet.
      </p>
    </form>
  );
}
