import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { buttonVariants } from "@/components/ui/Button";

export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <Card className="p-10">
        <h1 className="text-display-lg">{title}</h1>
        <p className="text-body mt-4 text-[var(--color-text-secondary)]">
          This page isn&apos;t published yet. Check back soon.
        </p>
        <Link
          href="/"
          className={
            buttonVariants({ variant: "secondary", size: "md" }) +
            " mt-6 inline-flex"
          }
        >
          Back to home
        </Link>
      </Card>
    </div>
  );
}
