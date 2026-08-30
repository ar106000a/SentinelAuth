import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";
import { MobileNav } from "@/components/marketing/MobileNav";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#quickstart", label: "Quickstart" },
  { href: "#security", label: "Security" },
];

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--color-border)] bg-[var(--color-base)]/80 backdrop-blur">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-display-md shrink-0">
          SentinelAuth
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-body text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-body text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className={buttonVariants({ variant: "primary", size: "sm" })}
          >
            Get started
          </Link>
        </div>

        <MobileNav />
      </div>
    </header>
  );
}
