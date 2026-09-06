import { Card } from "@/components/ui/Card";
import { RegisterForm } from "@/components/auth/RegisterForm";
import Link from "next/link";
import { redirectIfAuthenticated } from "@/lib/dashboard-session";

export default async function RegisterPage() {
  await redirectIfAuthenticated();
  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[var(--color-base)] px-6 py-12">
      <Card className="w-full max-w-sm p-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-display-lg">Create your tenant</h1>
          <p className="text-body text-[var(--color-text-secondary)]">
            Free to start. No credit card required.
          </p>
        </div>
        <RegisterForm />
        <p className="text-caption text-text-secondary justify-center text-center">Already have an account. <Link href={"/login"} className="text-text-primary">Login here.</Link></p>
      </Card>
    </main>
  );
}
