import { BarChart3, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

interface ChartSkeletonProps {
  height?: number;
}

/**
 * Deliberately irregular bar heights, not a uniform grid — a chart
 * skeleton that's obviously a placeholder (evenly spaced identical bars)
 * reads as less "real" than one that vaguely gestures at data variance.
 */
const BAR_HEIGHTS = [40, 65, 30, 80, 55, 90, 45, 70, 35, 60];

export function ChartSkeleton({ height = 240 }: ChartSkeletonProps) {
  return (
    <div className="flex items-end gap-2 px-2" style={{ height }} role="status" aria-label="Loading chart">
      {BAR_HEIGHTS.map((h, i) => (
        <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

interface ChartEmptyStateProps {
  height?: number;
  title?: string;
  description?: string;
}

export function ChartEmptyState({
  height = 240,
  title = "No data yet",
  description = "Activity will appear here once login attempts start coming in.",
}: ChartEmptyStateProps) {
  return (
    <div style={{ height }} className="flex items-center justify-center">
      <EmptyState icon={<BarChart3 />} title={title} description={description} />
    </div>
  );
}

interface ChartErrorStateProps {
  height?: number;
  onRetry?: () => void;
}

export function ChartErrorState({ height = 240, onRetry }: ChartErrorStateProps) {
  return (
    <div style={{ height }} className="flex items-center justify-center">
      <EmptyState
        icon={<AlertTriangle className="text-[var(--color-danger)]" />}
        title="Couldn't load this chart"
        description="Something went wrong fetching the data."
        action={
          onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          )
        }
      />
    </div>
  );
}