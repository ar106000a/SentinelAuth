"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { SignalLine } from "@/components/ui/SignalLine";
import { useNavigation } from "@/lib/navigation";
import { dashboardLogout } from "@/lib/api";

interface TopbarProps {
  tenantName: string;
}

export function Topbar({ tenantName }: TopbarProps) {
  const { isPending, navigate } = useNavigation();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await dashboardLogout();
    } catch {
      // Session may already be gone server-side (expired, revoked elsewhere) —
      // either way the goal is to land on /login, so a failed logout call
      // isn't treated as a blocking error here.
    } finally {
      navigate("/login");
    }
  };

  return (
    <header className="sticky top-0 z-10">
      {/* Reserves its height whether pending or not, so the layout below never shifts. */}
      <SignalLine
        loading={isPending || loggingOut}
        className={isPending || loggingOut ? undefined : "opacity-0"}
      />
      <div className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6">
        <span className="text-body text-[var(--color-text-secondary)]">
          {tenantName}
        </span>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-40"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Log out
        </button>
      </div>
    </header>
  );
}
