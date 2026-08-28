"use client";

import { useEffect, useRef, type ReactNode, type MouseEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

/**
 * Built on the native <dialog> element rather than a hand-rolled
 * portal/overlay: showModal() gives us focus trapping, Escape-to-close,
 * and inert background content for free, with no added dependency. <dialog>
 * is uncontrolled by nature (it has its own open/close DOM state), so this
 * wraps it in an imperative useEffect to keep it in sync with the `open`
 * prop, the same way you'd wrap any imperative browser API in React.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
  };

  // Native <dialog> doesn't close on backdrop click by default — this
  // checks the click landed on the dialog element itself (the ::backdrop
  // area), not on its content.
  const handleBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) {
      onOpenChange(false);
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={handleClose}
      onClick={handleBackdropClick}
      aria-labelledby="dialog-title"
      aria-describedby={description ? "dialog-description" : undefined}
      className={cn(
        "m-auto w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 text-[var(--color-text-primary)] backdrop:bg-black/60",
        className
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 id="dialog-title" className="text-display-md">
            {title}
          </h2>
          {description && (
            <p
              id="dialog-description"
              className="text-body text-[var(--color-text-secondary)]"
            >
              {description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close dialog"
          className="rounded-[var(--radius-sm)] p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
