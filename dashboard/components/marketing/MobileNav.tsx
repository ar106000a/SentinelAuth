"use client";

import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/Button";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#quickstart", label: "Quickstart" },
  { href: "#security", label: "Security" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  // Escape closes it, same expectation as the Dialog primitive.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000"}/dashboard/me`,
          {
            credentials: "include",
            cache: "no-store",
          }
        );
        const body = await res.json();
        if (mounted && body?.success) setAuthenticated(true);
      } catch (e) {
        if (mounted) setAuthenticated(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-16 border-b border-[var(--color-border)] bg-[var(--color-base)] px-6 py-4">
          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-body rounded-[var(--radius-sm)] px-2 py-2.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-[var(--color-border)] pt-3">
            <Link
              href={authenticated ? "/app" : "/login"}
              onClick={() => setOpen(false)}
              className={
                buttonVariants({ variant: "outline", size: "md" }) + " w-full"
              }
            >
              {authenticated ? "Dashboard" : "Sign in"}
            </Link>
            <Link
              href="/register"
              onClick={() => setOpen(false)}
              className={
                buttonVariants({ variant: "primary", size: "md" }) + " w-full"
              }
            >
              Get started
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
