"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  chartGridProps,
  chartAxisProps,
  chartTooltipContentStyle,
  chartTooltipLabelStyle,
} from "@/lib/chart-theme";
import type { LoginVolumeBucket } from "@/lib/api";

export interface LoginVolumeChartProps {
  data: LoginVolumeBucket[];
  height?: number;
}

/**
 * Deliberately plain neutral bars, not the risk gradient — a login count
 * per day carries no risk value of its own, and coloring it with the
 * gradient would misapply a signal that only means something when it's
 * actually a risk score (see RiskDistributionChart for where the
 * gradient belongs instead).
 */
export function LoginVolumeChart({
  data,
  height = 220,
}: LoginVolumeChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...chartGridProps} />
        <XAxis dataKey="date" {...chartAxisProps} />
        <YAxis {...chartAxisProps} allowDecimals={false} />
        <Tooltip
          contentStyle={chartTooltipContentStyle}
          labelStyle={chartTooltipLabelStyle}
          cursor={{ fill: "var(--color-surface-raised)" }}
        />
        <Bar
          dataKey="count"
          fill="var(--color-text-secondary)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
