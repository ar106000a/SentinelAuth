import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Renders a 2px signature gradient line along the top edge. Reserve this
   * for cards whose content is actually risk-related (a session's risk
   * breakdown, a flagged login) — not as generic visual flair. Most cards
   * should leave this off.
   */
  signal?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, signal = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]",
          className
        )}
        {...props}
      >
        {signal && <div className="gradient-signal absolute inset-x-0 top-0 h-[2px]" aria-hidden="true" />}
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center justify-between px-5 pt-5", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-display-md text-[var(--color-text-primary)]", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-5", className)} {...props} />
);
CardContent.displayName = "CardContent";
