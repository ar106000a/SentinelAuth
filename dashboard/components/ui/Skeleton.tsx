import { type CSSProperties } from "react";
import { cn } from "@/lib/cn";

export interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

/**
 * A single pulsing block. Compose it for real layouts rather than building
 * per-page skeleton variants — e.g. a table row skeleton is just a few of
 * these sized to match real cell content, kept in the page that uses it.
 */
export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      style={style}
      className={cn("animate-pulse rounded-[var(--radius-sm)] bg-[var(--color-surface-raised)]", className)}
      aria-hidden="true"
    />
  );
}