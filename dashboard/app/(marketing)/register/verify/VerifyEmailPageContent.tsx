"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";
import { VerifyEmailFlow } from "@/components/auth/VerifyEmailFlow";

export function VerifyEmailPageContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[var(--color-base)] px-6 py-12">
      <Card className="w-full max-w-sm p-8 space-y-6">
        {email ? (
          <>
            <h1 className="text-display-lg">Verify your email</h1>
            <VerifyEmailFlow email={email} />
          </>
        ) : (
          <div className="space-y-4 text-center">
            <h1 className="text-display-lg">Missing email</h1>
            <p className="text-body text-[var(--color-text-secondary)]">
              Start from the registration form so we know which account to
              verify.
            </p>
            <Link
              href="/register"
              className={buttonVariants({ variant: "secondary", size: "md" })}
            >
              Back to registration
            </Link>
          </div>
        )}
      </Card>
    </main>
  );
}
