"use client";

import {
  BarChart,
  Bar,
  Cell,
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
import { riskColor } from "@/lib/risk";
import type { RiskDistributionBucket } from "@/lib/api";

export interface RiskDistributionChartProps {
  data: RiskDistributionBucket[];
  height?: number;
}

/**
 * Unlike LoginVolumeChart, coloring each bar by riskColor() is correct
 * here — each bucket literally IS a risk-score range, so the gradient
 * carries real meaning per bar rather than being decorative.
 */
export function RiskDistributionChart({
  data,
  height = 220,
}: RiskDistributionChartProps) {
  const chartData = data.map((bucket) => ({
    ...bucket,
    label: `${bucket.min.toFixed(1)}–${bucket.max.toFixed(1)}`,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={chartData}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
      >
        <CartesianGrid {...chartGridProps} />
        <XAxis dataKey="label" {...chartAxisProps} />
        <YAxis {...chartAxisProps} allowDecimals={false} />
        <Tooltip
          contentStyle={chartTooltipContentStyle}
          labelStyle={chartTooltipLabelStyle}
          cursor={{ fill: "var(--color-surface-raised)" }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {chartData.map((bucket, i) => (
            <Cell key={i} fill={riskColor((bucket.min + bucket.max) / 2)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
