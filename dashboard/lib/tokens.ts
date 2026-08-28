/**
 * Raw hex values for the signature risk gradient — the single source of
 * truth for both lib/risk.ts (DOM color interpolation) and the chart theme
 * (SVG gradient defs need literal color strings, not CSS var()). These
 * MUST match app/globals.css's --color-risk-low/mid/high exactly — there's
 * no way to read a CSS custom property back into a plain JS string at
 * build time, so keeping both in sync by hand, in one place, is the best
 * available guard against drift.
 */
export const RISK_GRADIENT_HEX = {
  low: "#2ed573",
  mid: "#ffb020",
  high: "#ff3b5c",
} as const;

/** Chart-only neutrals, mirroring the equivalent CSS tokens for grid/axis/tooltip chrome. */
export const CHART_NEUTRAL_HEX = {
  grid: "#22262c", // --color-border
  axisText: "#8b92a0", // --color-text-secondary
  tooltipBg: "#1c2127", // --color-surface-raised
  tooltipBorder: "#2c3138", // --color-border-strong
} as const;