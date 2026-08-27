import { cn } from "@/lib/cn";
import { riskColor, riskTier } from "@/lib/risk";

export interface RiskBadgeProps {
  /** Risk score in the model's native [0, 1] range, e.g. from `risk_logs.score` or an /infer response. */
  score: number;
  /** Show the numeric score next to the dot. Off by default for dense table cells. */
  showValue?: boolean;
  className?: string;
}

/**
 * Renders risk as a dot positioned continuously on the signature gradient,
 * never as a discrete "Low / Medium / High" badge — two attempts scored
 * 0.49 and 0.51 should look like neighbors, not like they landed in
 * different buckets. The tier word exists only for screen readers and
 * filter UIs, never as the visible label.
 */
export function RiskBadge({ score, showValue = true, className }: RiskBadgeProps) {
  const color = riskColor(score);
  const tier = riskTier(score);

  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      role="img"
      aria-label={`Risk score ${score.toFixed(2)}, ${tier}`}
    >
      <span
        className="h-2 w-2 shrink-0 rounded-[var(--radius-full)]"
        style={{ backgroundColor: color, boxShadow: `0 0 6px 0 ${color}` }}
        aria-hidden="true"
      />
      {showValue && (
        <span className="text-data text-xs text-[var(--color-text-secondary)]">{score.toFixed(2)}</span>
      )}
    </span>
  );
}
