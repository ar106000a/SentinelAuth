"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { OtpInput } from "@/components/auth/OtpInput";
import {
  PasswordFields,
  MIN_PASSWORD_LENGTH,
} from "@/components/auth/PasswordFields";
import { resetTenantPassword, ApiError } from "@/lib/api";

export function ResetPasswordFlow({ email }: { email: string }) {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await resetTenantPassword(email, otp, password);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Try again."
      );
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2
          className="mx-auto h-8 w-8 text-[var(--color-risk-low)]"
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className="text-body text-[var(--color-text-primary)]">
            Password updated
          </p>
          <p className="text-caption">
            You&apos;ve been signed out of every active session as a precaution.
            Sign in again with your new password.
          </p>
        </div>
        <Button
          variant="primary"
          className="w-full"
          onClick={() => router.push("/login")}
        >
          Continue to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-body text-[var(--color-text-secondary)]">
        Enter the code sent to{" "}
        <span className="text-[var(--color-text-primary)]">{email}</span> and
        choose a new password.
      </p>

      <OtpInput value={otp} onChange={setOtp} disabled={submitting} />
      <PasswordFields
        password={password}
        onPasswordChange={setPassword}
        confirmPassword={confirmPassword}
        onConfirmPasswordChange={setConfirmPassword}
        disabled={submitting}
        passwordLabel="New password"
      />

      <p className="text-caption">
        Resetting your password signs you out of every active session, including
        any other tenant admin currently logged in.
      </p>

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
        {submitting ? "Resetting…" : "Reset password"}
      </Button>
    </form>
  );
}
