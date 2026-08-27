import { cn } from "@/lib/cn";

export interface SignalLineProps {
  /** Animate as an indeterminate loading sweep (route transitions, async fetches). */
  loading?: boolean;
  className?: string;
}

/**
 * The product's signature device, standalone. Static, it reads as a
 * structural accent (used inside Card via the `signal` prop). Animated,
 * it becomes the app's loading indicator — a nav-top progress line that
 * IS the risk gradient, so even the "please wait" state stays on-brand
 * instead of borrowing a generic spinner color.
 */
export function SignalLine({ loading = false, className }: SignalLineProps) {
  return (
    <div
      className={cn("gradient-signal h-[2px] w-full", loading && "animate-signal-sweep bg-[length:200%_100%]", className)}
      role={loading ? "progressbar" : undefined}
      aria-label={loading ? "Loading" : undefined}
    />
  );
}
