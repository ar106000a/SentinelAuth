import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-base)] px-6">
      <Card className="max-w-sm space-y-4 p-8 text-center">
        <p className="text-data text-4xl text-[var(--color-text-secondary)]">
          404
        </p>
        <div className="space-y-1">
          <h1 className="text-display-lg">Page not found</h1>
          <p className="text-body text-[var(--color-text-secondary)]">
            The page you&apos;re looking for doesn&apos;t exist or has moved.
          </p>
        </div>
        <Link
          href="/"
          className={buttonVariants({ variant: "primary", size: "md" })}
        >
          Back to home
        </Link>
      </Card>
    </main>
  );
}
