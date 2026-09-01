"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { SecretReveal } from "@/components/ui/SecretReveal";
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

      <div className="space-y-1.5">
        <label htmlFor="otp" className="text-caption block">
          Verification code
        </label>
        <input
          id="otp"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          autoComplete="one-time-code"
          required
          value={otp}
          onChange={(e) =>
            setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          className="text-data h-12 w-full rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-3 text-center text-2xl tracking-[0.5em] text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-focus)]"
        />
      </div>

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

      {/* No resend-OTP endpoint exists yet — noted as a tracked gap
          elsewhere in the project. Not building a button against an
          endpoint that doesn't exist. */}
      <p className="text-caption text-center">
        Didn&apos;t get a code? Check spam — resend isn&apos;t available yet.
      </p>
    </form>
  );
}
