import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-16 text-center", className)}>
      {icon && (
        <div className="text-[var(--color-text-tertiary)] [&>svg]:h-8 [&>svg]:w-8" aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <p className="text-body font-medium text-[var(--color-text-primary)]">{title}</p>
        {description && <p className="text-caption max-w-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}