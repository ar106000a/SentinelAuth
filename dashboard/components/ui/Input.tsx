import { type InputHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="text-caption block">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            "h-10 w-full rounded-[var(--radius-sm)] border bg-[var(--color-surface-raised)] px-3 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-0",
            error
              ? "border-[var(--color-danger)] focus-visible:border-[var(--color-danger)] focus-visible:ring-[var(--color-danger)]"
              : "border-[var(--color-border-strong)] focus-visible:border-[var(--color-focus)] focus-visible:ring-[var(--color-focus)]",
            className
          )}
          {...props}
        />
        {error && (
          <p
            id={`${inputId}-error`}
            role="alert"
            className="text-caption text-[var(--color-danger)]"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
