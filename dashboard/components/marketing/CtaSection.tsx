import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";

export function CtaSection() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h2 className="text-display-lg">Start scoring logins, not just gating them</h2>
      <p className="text-body mx-auto mt-3 max-w-md text-[var(--color-text-secondary)]">
        Free to start. No credit card required.
      </p>
      <div className="mt-8">
        <Link href="/register" className={buttonVariants({ variant: "primary", size: "lg" })}>
          Create your tenant
        </Link>
      </div>
    </section>
  );
}