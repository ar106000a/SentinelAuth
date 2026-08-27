"use client";

import { createContext, useContext, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

interface NavigationContextValue {
  isPending: boolean;
  navigate: (href: string) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

/**
 * App Router doesn't expose a route-change-start/end event the way the old
 * Pages Router did, and `useLinkStatus` only reports pending state to a
 * child of one specific `<Link>` — not useful for a single top-bar
 * indicator. Wrapping our own `router.push` in `useTransition` gives one
 * `isPending` value for the whole shell, which is what the signal-line
 * loading indicator needs.
 */
export function NavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <NavigationContext.Provider value={{ isPending, navigate }}>{children}</NavigationContext.Provider>
  );
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error("useNavigation must be used within NavigationProvider");
  }
  return ctx;
}