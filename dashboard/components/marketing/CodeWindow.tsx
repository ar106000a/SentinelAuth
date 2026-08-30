"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

export interface CodeWindowProps {
  filename?: string;
  /** Small pulsing "live" indicator instead of a filename — used by the console variant. */
  live?: boolean;
  /** Raw text to put on the clipboard. Omit to hide the copy button (e.g. for the live console). */
  copyText?: string;
  children: ReactNode;
  className?: string;
}

export function CodeWindow({
  filename,
  live,
  copyText,
  children,
  className,
}: CodeWindowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!copyText) return;
    await navigator.clipboard.writeText(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={cn(
        "overflow-hidden --font-mono rounded-[var(--radius-lg)] border border-[var(--color-border-strong)] bg-[var(--color-base)] shadow-xl ",
        className
      )}
    >
      <div className="flex h-10 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4">
        <div className="flex items-center gap-2">
          {/* Standard macOS traffic-light convention — not a reuse of the
              product's risk gradient, just the universal OS window chrome. */}
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: "#ff5f56" }}
          />
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: "#ffbd2e" }}
          />
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: "#27c93f" }}
          />
        </div>

        {filename && <span className="text-caption font-mono">{filename}</span>}
        {live && (
          <span className="text-caption flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-risk-low)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-risk-low)]" />
            </span>
            live
          </span>
        )}

        {copyText ? (
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy code"
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          !filename && !live && <span />
        )}
      </div>
      <div className="overflow-x-auto p-4">{children}</div>
    </div>
  );
}
