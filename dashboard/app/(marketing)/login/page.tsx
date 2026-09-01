import { Card } from "@/components/ui/Card";
import { LoginForm } from "@/components/auth/LoginForm";
import { redirectIfAuthenticated } from "@/lib/dashboard-session";
import Link from "next/link";

export default async function LoginPage() {
  await redirectIfAuthenticated();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-base)] px-6">
      <Card className="w-full max-w-sm p-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-display-lg">SentinelAuth</h1>
          <p className="text-body text-[var(--color-text-secondary)]">
            Sign in to your dashboard.
          </p>
        </div>
        <LoginForm />
        <p className="text-caption text-text-secondary justify-center text-center">
          Do not have an account.{" "}
          <Link href={"/register"} className="text-text-primary">
            Register here.
          </Link>
        </p>
      </Card>
    </main>
  );
}
