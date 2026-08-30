import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Variant design intent:
 *
 * - `primary`  — high-contrast neutral (off-white fill, dark text). The
 *   product's one bold color is the risk gradient; a primary CTA does not
 *   compete with it for attention, so primary stays achromatic.
 * - `secondary`— surface fill, for actions that share a toolbar with a
 *   primary action but shouldn't out-rank it.
 * - `ghost`    — transparent, bordered on hover only. Table-row actions,
 *   low-emphasis controls.
 * - `danger`   — fills with --color-danger, which *is* --color-risk-high.
 *   Destructive actions (revoke a key, remove a user) are deliberately
 *   drawn from the same red as a maxed-out risk score — in this product's
 *   vocabulary, both mean "this is the dangerous end."
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] text-sm font-medium font-body transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--color-text-primary)] text-[var(--color-base)] hover:bg-white",
        secondary:
          "bg-[var(--color-surface-raised)] text-[var(--color-text-primary)] border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-hover)]",
        outline:
          "bg-transparent !text-[var(--color-text-primary)] border border-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:border-[var(--color-text-primary)]",
        ghost:
          "bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]",
        danger:
          "bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger-hover)]",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-4",
        lg: "h-11 px-5 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends
    ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
