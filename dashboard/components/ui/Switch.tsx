"use client";

import { cn } from "@/lib/cn";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        // 1. Layout & Animation: inline-flex handles vertical centering naturally without absolute positioning
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors duration-200 ease-in-out disabled:cursor-not-allowed disabled:opacity-40",
        // 2. Focus: Override the global squarish outline to maintain the rounded pill shape
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]",
        checked
          ? "border-transparent bg-[var(--color-text-primary)]"
          : "border-[var(--color-border-strong)] bg-[var(--color-surface-raised)]"
      )}
    >
      <span
        className={cn(
          // 3. Movement: translate-x classes now actually trigger the transition-transform
          "pointer-events-none inline-block h-5 w-5 rounded-full shadow-sm transition-transform duration-200 ease-in-out",
          checked
            ? // 4. Contrast: Dark thumb on white track (checked) vs White thumb on dark track (unchecked)
              "translate-x-5 bg-[var(--color-base)]"
            : "translate-x-0 bg-[var(--color-text-primary)]"
        )}
      />
    </button>
  );
}
