"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { registerTenant, ApiError } from "@/lib/api";

const MIN_PASSWORD_LENGTH = 12;

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Live, not just on submit — matches the confirm-password behavior
  // already shipped in the SDK's own register component.
  const confirmError =
    confirmPassword.length > 0 && confirmPassword !== password
      ? "Passwords don't match."
      : undefined;
  const passwordHint =
    password.length > 0 && password.length < MIN_PASSWORD_LENGTH
      ? `At least ${MIN_PASSWORD_LENGTH} characters (${password.length}/${MIN_PASSWORD_LENGTH}).`
      : undefined;

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
      await registerTenant(name, adminEmail, password);
      router.push(`/register/verify?email=${encodeURIComponent(adminEmail)}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Try again."
      );
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Company name"
        autoComplete="organization"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        label="Work email"
        type="email"
        autoComplete="email"
        required
        value={adminEmail}
        onChange={(e) => setAdminEmail(e.target.value)}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={passwordHint}
      />
      <Input
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={confirmError}
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
        {submitting ? "Creating account…" : "Create your tenant"}
      </Button>
    </form>
  );
}
