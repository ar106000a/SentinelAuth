# Week A · Day 1 — Notes

## What's built
- Fresh `dashboard/` Next.js 15 (App Router) + Tailwind v4 scaffold, wired the way the rest of the
  monorepo's Next apps are (no `tailwind.config.ts`, CSS-based `@theme` tokens instead).
  The old `dashboard/pnpm-workspace.yaml` should be deleted — it's a stray file from `create-next-app`
  scaffolding and was never supposed to make this package its own workspace root.
- Design tokens in `app/globals.css`: surfaces, borders, text, the risk gradient, radius scale, and a
  hand-set type scale (display/body/caption/data), all as CSS custom properties consumed by Tailwind v4's
  `@theme`.
- Four primitives: `Button`, `Card`, `RiskBadge`, `SignalLine`.
- `lib/risk.ts`: single source of truth for score → color, continuous interpolation (not bucketed).
- `/design-system` route renders all of the above against real values — open it and react to something
  real rather than a description.

## Decisions made (and why)
- **Primary button is achromatic** (off-white fill on dark), not a new accent color. The gradient is this
  product's one signature; a colored primary CTA would compete with it. This wasn't in the original
  handoff doc explicitly — it's a Day-1 call, flag it if it doesn't feel right before Week B builds on it.
- **Danger button reuses `--color-risk-high`**, not a separate red. Revoking a key or removing a user is,
  in this product's own vocabulary, a high-risk action — so it borrows the same red the gradient uses at
  score 1.0 instead of inventing a second red.
- **Focus ring uses `--color-text-primary`**, not a new hue either — same "spend the one bold color
  carefully" logic.
- **RiskBadge is a dot + mono number, positioned continuously on the gradient** — no discrete
  Low/Medium/High badge. `riskTier()` exists only for screen-reader text and future filter dropdowns, never
  as the visible label.
- Fonts: Space Grotesk (display), Inter (body), JetBrains Mono (all numbers — tabular-nums). Loaded via
  `next/font/google` in `layout.tsx`, exposed as CSS vars, consumed by the `@theme` font tokens.

## Verified
- `npm install` + `next build` — clean compile, zero TS errors. (Font fetch itself can't be verified in
  this sandbox — Google Fonts isn't on the sandbox's network allowlist — but the fetch call and font
  config are standard `next/font/google` usage and will resolve normally with real network access.)

## Next (Week A, Day 2 onward)
- App shell: sidebar nav, top bar with the animated `SignalLine` as the route-loading indicator, tenant
  switcher.
- Auth screens (tenant login, not the SDK's end-user auth) against `POST /dashboard/session` from
  `API_IMPLEMENTATION_DETAILS.md`.
- Table primitive for audit logs / user lists — will need to reuse `RiskBadge` and `riskColor()` in a
  dense row context; check contrast at small sizes when that happens.
