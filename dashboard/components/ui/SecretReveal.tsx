"use client";

import { useState, useEffect } from "react";
import { Check, Copy, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface SecretRevealField {
  label: string;
  value: string;
}

export interface SecretRevealProps {
  fields: SecretRevealField[];
  warning: string;
  acknowledgeLabel: string;
  onAcknowledge: () => void;
}

function CopyableField({ label, value }: SecretRevealField) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-1.5">
      <span className="text-caption block">{label}</span>
      <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] p-3">
        <code className="text-data flex-1 break-all text-xs text-[var(--color-text-primary)]">
          {value}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy ${label}`}
          className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * For any credential the backend genuinely won't show again (a new API
 * secret key, a rotated key pair). Requires explicit acknowledgment before
 * the caller lets the user navigate away, and warns on tab-close/refresh
 * in the same window — the backend's "shown once" property should be felt
 * in the UI, not just be a true statement no one notices.
 */
export function SecretReveal({
  fields,
  warning,
  acknowledgeLabel,
  onAcknowledge,
}: SecretRevealProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (acknowledged) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [acknowledged]);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[var(--color-danger)]/10 p-3">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-danger)]"
          aria-hidden="true"
        />
        <p className="text-caption text-[var(--color-text-primary)]">
          {warning}
        </p>
      </div>

      <div className="space-y-4">
        {fields.map((field) => (
          <CopyableField key={field.label} {...field} />
        ))}
      </div>

      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-text-primary)]"
        />
        <span className="text-caption">
          I&apos;ve saved these somewhere safe.
        </span>
      </label>

      <Button
        variant="primary"
        className="w-full"
        disabled={!acknowledged}
        onClick={onAcknowledge}
      >
        {acknowledgeLabel}
      </Button>
    </div>
  );
}
