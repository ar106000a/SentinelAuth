"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipContentProps,
} from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import {
  RISK_GRADIENT_ID,
  RiskGradientDefs,
  chartGridProps,
  chartAxisProps,
  chartTooltipContentStyle,
  chartTooltipLabelStyle,
} from "@/lib/chart-theme";

export interface RiskTrendPoint {
  timestamp: string;
  score: number;
}

interface RiskTrendChartProps {
  data: RiskTrendPoint[];
  height?: number;
}

function CustomTooltip({
  active,
  payload,
  label,
}: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const score = payload[0].value;
  const scoreLabel =
    typeof score === "number" ? score.toFixed(2) : String(score);

  return (
    <div style={chartTooltipContentStyle} className="px-3 py-2">
      <p style={chartTooltipLabelStyle} className="text-caption">
        {label}
      </p>
      <p className="text-data text-sm text-[var(--color-text-primary)]">
        {scoreLabel}
      </p>
    </div>
  );
}

/**
 * The gradient fill is positioned by the chart's Y axis (risk score
 * domain), not recolored per data point — a spike toward 1.0 reads redder
 * near its peak and fades toward green near the baseline, the same
 * continuous logic as RiskBadge, just applied to an area instead of a dot.
 * The stroke stays a plain neutral line on top so the gradient doesn't
 * compete with itself.
 */
export function RiskTrendChart({ data, height = 240 }: RiskTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <RiskGradientDefs />
        <CartesianGrid {...chartGridProps} />
        <XAxis dataKey="timestamp" {...chartAxisProps} />
        <YAxis domain={[0, 1]} ticks={[0, 0.5, 1]} {...chartAxisProps} />
        <Tooltip
          content={(props) => <CustomTooltip {...props} />}
          cursor={{ stroke: "var(--color-border-strong)" }}
        />
        <Area
          type="monotone"
          dataKey="score"
          stroke="var(--color-text-primary)"
          strokeWidth={1.5}
          fill={`url(#${RISK_GRADIENT_ID})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
