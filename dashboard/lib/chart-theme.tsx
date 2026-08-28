import { RISK_GRADIENT_HEX, CHART_NEUTRAL_HEX } from "@/lib/tokens";

export const RISK_GRADIENT_ID = "risk-gradient";

/**
 * The SVG <defs> for the signature gradient, as an actual paintable
 * gradient rather than three discrete color stops on a bar chart. Render
 * this once inside a chart's <defs>, then reference it via
 * `fill={`url(#${RISK_GRADIENT_ID})`}` on an Area/Bar/Line.
 */
export function RiskGradientDefs() {
  return (
    <defs>
      <linearGradient id={RISK_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
        <stop
          offset="0%"
          stopColor={RISK_GRADIENT_HEX.high}
          stopOpacity={0.35}
        />
        <stop
          offset="50%"
          stopColor={RISK_GRADIENT_HEX.mid}
          stopOpacity={0.25}
        />
        <stop
          offset="100%"
          stopColor={RISK_GRADIENT_HEX.low}
          stopOpacity={0.05}
        />
      </linearGradient>
    </defs>
  );
}

/** Recharts prop bundles — spread these onto <CartesianGrid>/<XAxis>/<YAxis> so every chart shares the same chrome. */
export const chartGridProps = {
  stroke: CHART_NEUTRAL_HEX.grid,
  strokeDasharray: "3 3",
  vertical: false,
} as const;

export const chartAxisProps = {
  stroke: CHART_NEUTRAL_HEX.grid,
  tick: {
    fill: CHART_NEUTRAL_HEX.axisText,
    fontSize: 12,
    fontFamily: "var(--font-body)",
  },
  tickLine: false,
  axisLine: false,
} as const;

export const chartTooltipContentStyle = {
  background: CHART_NEUTRAL_HEX.tooltipBg,
  border: `1px solid ${CHART_NEUTRAL_HEX.tooltipBorder}`,
  borderRadius: "var(--radius-sm)",
  fontFamily: "var(--font-body)",
  fontSize: "0.8125rem",
} as const;

export const chartTooltipLabelStyle = {
  color: CHART_NEUTRAL_HEX.axisText,
  marginBottom: "0.25rem",
} as const;
