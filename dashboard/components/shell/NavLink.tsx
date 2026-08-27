"use client";

import { usePathname } from "next/navigation";
import { type MouseEvent, type ReactNode } from "react";
import { useNavigation } from "@/lib/navigation";
import { cn } from "@/lib/cn";

interface NavLinkProps {
  href: string;
  icon: ReactNode;
  children: ReactNode;
}

export function NavLink({ href, icon, children }: NavLinkProps) {
  const pathname = usePathname();
  const { navigate } = useNavigation();
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Let the browser handle it natively for new-tab / new-window clicks —
    // only intercept a plain left click.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    navigate(href);
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-[var(--color-surface-raised)] text-[var(--color-text-primary)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
      )}
    >
      <span className="[&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
        {icon}
      </span>
      {children}
    </a>
  );
}