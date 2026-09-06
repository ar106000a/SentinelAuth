"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Registration is idempotent (GSAP no-ops repeat registrations), but this
// module still only ever runs in a "use client" tree, never during SSR —
// ScrollTrigger touches `window`/`document` at registration time.
gsap.registerPlugin(ScrollTrigger);

export { gsap, ScrollTrigger };
/**
 * The global `prefers-reduced-motion` CSS rule in globals.css only
 * affects CSS animations/transitions — it has zero effect on GSAP
 * timelines, since those are driven by JS style writes, not CSS. Every
 * component that builds a GSAP timeline checks this first and either
 * skips the animation (reveal-type effects — content just renders at
 * its natural, already-visible state) or shows one static frame instead
 * of a continuous loop (RiskGauge).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
