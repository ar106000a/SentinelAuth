"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";
import { ResetPasswordFlow } from "@/components/auth/ResetPasswordFlow";

export function ResetPasswordPageContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email");

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[var(--color-base)] px-6 py-12">
      <Card className="w-full max-w-sm p-8 space-y-6">
        {email ? (
          <>
            <h1 className="text-display-lg">Reset your password</h1>
            <ResetPasswordFlow email={email} />
          </>
        ) : (
          <div className="space-y-4 text-center">
            <h1 className="text-display-lg">Missing email</h1>
            <p className="text-body text-[var(--color-text-secondary)]">
              Start from the password reset request so we know which account
              this is for.
            </p>
            <Link
              href="/forgot-password"
              className={buttonVariants({ variant: "secondary", size: "md" })}
            >
              Request a reset code
            </Link>
          </div>
        )}
      </Card>
    </main>
  );
}
