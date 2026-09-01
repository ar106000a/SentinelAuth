"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { dashboardLogin, ApiError } from "@/lib/api";

// Copy tailored per error code rather than always showing the raw API
// message — the API's message is written for API consumers, not
// necessarily the friendliest thing to put in front of a human at a login
// form. Falls back to the raw message for anything not called out here.
function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "RATE_LIMITED") {
      return "Too many attempts. Please wait a moment and try again.";
    }
    return err.message;
  }
  return "Something went wrong. Check your connection and try again.";
}

export function LoginForm() {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await dashboardLogin(adminEmail, password);
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  };

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
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="login-password" className="text-caption">
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-caption text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          disabled={submitting}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
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
        disabled={submitting}
      >
        {submitting && (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        )}
        {submitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
