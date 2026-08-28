"use client";

import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useToast, type ToastItem, type ToastVariant } from "@/lib/toast";
import { cn } from "@/lib/cn";

const VARIANT_CONFIG: Record<ToastVariant, { icon: typeof Info; accentClass: string }> = {
  // Reuses the risk-gradient endpoints rather than introducing new hues —
  // same reasoning as the Button danger variant: this product already has
  // a green and a red with meaning, no need for a third pair.
  default: { icon: Info, accentClass: "text-[var(--color-text-secondary)]" },
  success: { icon: CheckCircle2, accentClass: "text-[var(--color-risk-low)]" },
  danger: { icon: AlertCircle, accentClass: "text-[var(--color-danger)]" },
};

function ToastCard({ item }: { item: ToastItem }) {
  const { dismiss } = useToast();
  const { icon: Icon, accentClass } = VARIANT_CONFIG[item.variant];

  return (
    <div
      role="status"
      className="animate-toast-in flex w-80 items-start gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] p-4 shadow-lg"
    >
      <Icon className={cn("h-5 w-5 shrink-0", accentClass)} aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-body font-medium text-[var(--color-text-primary)]">{item.title}</p>
        {item.description && <p className="text-caption">{item.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label="Dismiss notification"
        className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Mount once near the root (app/layout.tsx) — reads the shared toast queue. */
export function Toaster() {
  const { toasts } = useToast();

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastCard item={t} />
        </div>
      ))}
    </div>
  );
}