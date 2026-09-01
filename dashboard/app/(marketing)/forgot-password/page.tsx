import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[var(--color-base)] px-6 py-12">
      <Card className="w-full max-w-sm p-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-display-lg">Reset your password</h1>
          <p className="text-body text-[var(--color-text-secondary)]">
            Enter the email for your tenant account and we&apos;ll send a reset
            code.
          </p>
        </div>
        <ForgotPasswordForm />
        <Link
          href="/login"
          className="text-caption block text-center hover:text-[var(--color-text-primary)]"
        >
          Back to sign in
        </Link>
      </Card>
    </main>
  );
}
