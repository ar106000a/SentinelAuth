"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { requestTenantPasswordReset, ApiError } from "@/lib/api";

export function ForgotPasswordForm() {
  const [adminEmail, setAdminEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestTenantPasswordReset(adminEmail);
      // Always the same success state, regardless of whether the API's
      // response implies the account existed — the API itself already
      // returns a generic message for exactly this reason (email
      // enumeration prevention), and the UI has to preserve that property
      // rather than quietly undoing it with a different look for a
      // different outcome.
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Try again."
      );
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-3 text-center">
        <CheckCircle2
          className="mx-auto h-8 w-8 text-[var(--color-risk-low)]"
          aria-hidden="true"
        />
        <p className="text-body text-[var(--color-text-primary)]">
          Check your email
        </p>
        <p className="text-caption">
          If an account exists for{" "}
          <span className="text-[var(--color-text-primary)]">{adminEmail}</span>
          , we&apos;ve sent a password reset code.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        autoFocus
        required
        disabled={submitting}
        value={adminEmail}
        onChange={(e) => setAdminEmail(e.target.value)}
      />

      {error && (
        <p role="alert" className="text-caption text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={submitting}
      >
        {submitting ? "Sending…" : "Send reset code"}
      </Button>
    </form>
  );
}
