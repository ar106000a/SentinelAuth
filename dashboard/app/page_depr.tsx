import Link from "next/link";
import { Card } from "@/components/ui/Card";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-base)] px-6">
      <Card className="max-w-md p-8 text-center space-y-3">
        <h1 className="text-display-lg">SentinelAuth Dashboard</h1>
        <p className="text-body text-[var(--color-text-secondary)]">
          Design tokens and primitives are in place. The app shell, auth flow, and real screens land over the
          next few days.
        </p>
        <Link
          href="/design-system"
          className="inline-block text-sm text-[var(--color-text-primary)] underline underline-offset-4"
        >
          View design system →
        </Link>
      </Card>
    </main>
  );
}
