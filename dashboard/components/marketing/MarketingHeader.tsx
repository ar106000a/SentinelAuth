import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";
import { MobileNav } from "@/components/marketing/MobileNav";
import { cookies } from "next/headers";
import { API_URL } from "@/lib/env";

const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#quickstart", label: "Quickstart" },
  { href: "/#security", label: "Security" },
];

export async function MarketingHeader() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("dashboard_session")?.value;

  let authenticated = false;
  if (sessionToken) {
    try {
      const res = await fetch(`${API_URL}/dashboard/me`, {
        headers: { Cookie: `dashboard_session=${sessionToken}` },
        cache: "no-store",
      });
      const body = await res.json();
      if (body?.success) authenticated = true;
    } catch (_) {
      authenticated = false;
    }
  }

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
            href={authenticated ? "/app" : "/login"}
            className="text-body text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            {authenticated ? "Dashboard" : "Sign in"}
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
