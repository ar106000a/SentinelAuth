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

const RISK_LOW = { r: 0x2e, g: 0xd5, b: 0x73 }; // --color-risk-low
const RISK_MID = { r: 0xff, g: 0xb0, b: 0x20 }; // --color-risk-mid
const RISK_HIGH = { r: 0xff, g: 0x3b, b: 0x5c }; // --color-risk-high

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
