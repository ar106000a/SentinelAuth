/**
 * Single source of truth for mapping a risk score (0.0–1.0) onto the
 * product's signature gradient (risk-low → risk-mid → risk-high).
 *
 * Deliberately continuous, not bucketed: a score of 0.42 and a score of
 * 0.58 should look like neighbors, not like two different traffic-light
 * states. Any component that needs to color something by risk score
 * (the badge dot today, a chart or table cell later) should import this
 * instead of re-deriving its own color logic.
 */

import { RISK_GRADIENT_HEX } from "@/lib/tokens";

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

const RISK_LOW = hexToRgb(RISK_GRADIENT_HEX.low);
const RISK_MID = hexToRgb(RISK_GRADIENT_HEX.mid);
const RISK_HIGH = hexToRgb(RISK_GRADIENT_HEX.high);

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

/** Clamp a risk score into [0, 1] — inference can, in theory, hand back an edge value. */
function clamp01(score: number) {
  return Math.min(1, Math.max(0, score));
}

/**
 * Returns an `rgb(...)` string for a risk score, interpolated across the
 * two gradient segments (low→mid for the bottom half, mid→high for the
 * top half).
 */
export function riskColor(score: number): string {
  const s = clamp01(score);
  const from = s <= 0.5 ? RISK_LOW : RISK_MID;
  const to = s <= 0.5 ? RISK_MID : RISK_HIGH;
  const t = s <= 0.5 ? s / 0.5 : (s - 0.5) / 0.5;

  const r = lerp(from.r, to.r, t);
  const g = lerp(from.g, to.g, t);
  const b = lerp(from.b, to.b, t);

  return `rgb(${r}, ${g}, ${b})`;
}

export type RiskTier = "low" | "elevated" | "high";

/**
 * A coarse tier label for places that need words, not just color — e.g.
 * screen-reader text, filter dropdowns, audit log entries. The dot's
 * actual position on the gradient stays continuous; this is only ever
 * supplementary text.
 */
export function riskTier(score: number): RiskTier {
  const s = clamp01(score);
  if (s < 0.34) return "low";
  if (s < 0.67) return "elevated";
  return "high";
}
