# SentinelAuth Dashboard — Handoff (post Week D)

This supersedes `WEEK_A_DAY_1_NOTES.md`, which only covers early Week A and
was never kept current past that. This is the real state of the dashboard
as of the end of the planned 4-week build. Delete the old notes file once
this is read.

---

## 1. What this is

The tenant-admin dashboard for SentinelAuth, a Next.js 15 (App Router) +
Tailwind v4 app living in the monorepo at `dashboard/`, separate from the
SDK's end-user auth surface (`sdk/`, `packages/react/`). It talks to the
`api` package's `/tenants/*` and `/dashboard/*` routes only — never the
`/api/auth/*` end-user routes, which belong to the SDK's trust domain.

Runs on port **3001** in dev (`next dev --turbopack -p 3001`) — this isn't
arbitrary, it's the exact origin the API's CORS config allows with
credentials.

---

## 2. Route map
/marketing landing page (marketing) group
/login (marketing) group
/register (marketing) group
/register/verify (marketing) group
/forgot-password (marketing) group
/reset-password (marketing) group
/about, /contact, /privacy, /terms "coming soon" stubs, (marketing) group
/design-system internal dev tool, not in either group

/app Overview
/app/users Users } literal /app folder,
/app/audit-logs Audit Log } session-gated by app/app/layout.tsx
/app/settings Settings }
/app/api-keys API Keys /


The shell used to live at bare `/` — it moved to `/app` in Week B once the
marketing page needed the root. If you're looking for the Overview page
and it's not at `/`, that's why.

---

## 3. Design system reference

**The one signature**: the risk gradient (green -> amber -> red,
`--color-risk-low/mid/high`). It appears on: `RiskBadge`, the `signal`
prop on `Card`, `SignalLine` (loading/accent), `RiskThresholdSlider`'s
track, `RiskDistributionChart`'s bars, `RiskGauge`'s arc. It does **not**
appear as decoration anywhere else — `LoginVolumeChart` is deliberately
plain neutral bars because a count has no risk value.

**Achromatic by default**: primary buttons, focus rings, and the Switch
primitive are all off-white/dark, not colored — the gradient is the one
bold thing this product gets. Danger actions (revoke key, delete user)
reuse `--color-risk-high` rather than a second invented red, since in this
product's vocabulary a destructive action already means "the dangerous
end of the scale."

**Primitives** (`components/ui/`): Button (variants: primary, secondary,
outline, ghost, danger), Card, Input, Table, Dialog (native `<dialog>`,
not hand-rolled), Toast (+ `lib/toast.tsx` for the provider/hook),
EmptyState, Skeleton, Switch, SecretReveal (generic "shown once"
credential display — used by email verification AND key rotation),
RiskBadge, SignalLine.

**Charts** (`components/charts/`): RiskTrendChart, LoginVolumeChart,
RiskDistributionChart, plus ChartSkeleton/ChartEmptyState/ChartErrorState.
Shared theming in `lib/chart-theme.tsx`.

**Fonts**: Space Grotesk (display), Inter (body), JetBrains Mono (every
number, tabular-nums) — loaded in the root `app/layout.tsx`.

**Type scale uses `clamp()`**, not fixed sizes — fluid across viewport
width, added during the mobile-responsiveness fix in Week B.

---

## 4. Architecture decisions worth knowing

- **`tsconfig.json` extends the monorepo's `tsconfig.base.json`**,
  overriding only the bundler-specific fields (`module`/`moduleResolution`
  -> `esnext`/`bundler`, `noEmit`, `lib`, `jsx`) — the base's `NodeNext`
  settings are correct for `api` but break a Next.js app.
- **`requireDashboardSession()`** (`lib/dashboard-session.ts`) is wrapped
  in React's `cache()` — the shell layout and every page under `/app/*`
  independently call it for their own data, and without the dedup that's
  a redundant `/dashboard/me` fetch per page load.
- **`apiFetch`'s `redirectOnAuthError` is opt-in, not automatic.**
  `AUTHENTICATION_ERROR` means "session expired" for shell calls but
  "wrong password" for `dashboardLogin` — auto-redirecting on the login
  page itself would bounce someone back to the page they're already on.
  Every `/dashboard/*` call passes the flag; the public auth-flow calls
  don't.
- **Server-side session checks manually forward the cookie.** Server
  Components don't auto-forward the incoming request's cookies to an
  outgoing `fetch` when the target is a different origin — the
  `dashboard_session` cookie is read via `cookies()` and attached to the
  `Cookie` header by hand in `lib/dashboard-session.ts`.
- **`SameSite=Strict` works on `localhost:3000`<->`3001` today** because
  same-site is defined by registrable domain, not port — but it will
  silently break the moment dashboard and API move to different
  subdomains in production. Not a dashboard-side fix; put it on the
  deployment checklist.
- **GSAP timelines check `prefersReducedMotion()`** (`lib/gsap.ts`) —
  the global CSS `prefers-reduced-motion` rule only covers CSS
  animations, not GSAP's JS-driven ones.

---

## 5. Known gaps — read this before assuming anything works end-to-end

**Backend doesn't exist yet for Overview's charts.** `fetchLoginVolume`,
`fetchMfaRate`, `fetchRiskDistribution` (`lib/api.ts`) call a contract
agreed with the API owner (see the `PROPOSED ENDPOINTS` comment there) but
`GET /dashboard/analytics/*` isn't implemented server-side. Every panel on
Overview will legitimately show `ChartErrorState` until it is — that's
correct behavior, not a bug. No further frontend work should be needed
once the routes ship.

**`TenantUser`/`PaginatedUsers` response shape is inferred, not
confirmed** (`lib/api.ts`, used by `UsersTable`). The doc gives the
`users` table schema and this endpoint's query params but not its exact
response envelope — field names and the pagination wrapper shape are a
reasoned guess from schema + this codebase's conventions elsewhere. This
is the one page where a wrong guess breaks the whole table, not just a
type comment. Verify against a real response before trusting it.

**No resend-OTP endpoint exists** — noted in both the SDK's own commit
history and carried into this dashboard's `VerifyEmailFlow`. The UI says
so plainly rather than showing a dead button.

**Card border/fill contrast is a flagged, unresolved trade-off.** Card
fill vs. page background measures 1.08:1; the border measures 1.2-1.4:1
against every surface it sits on — both under WCAG thresholds. Fixing
this means either heavier borders (tested up to `#4d5560`, still only
~2.5:1) or a different boundary technique (shadow/elevation) — a real
design decision, not a token tweak. See Week D Day 3's commit for the
measured numbers.

**`eventType` filter list on Audit Log may not be exhaustive** — built
only from the 8 event-type strings the doc names explicitly. There's
likely an undocumented baseline event for an ordinary successful login.

**Footer social links and contact email are placeholder `href="#"`**,
marked with a `TODO` comment in `MarketingFooter.tsx` — deliberately not
fabricated URLs. **Privacy Policy / Terms of Service are honest "coming
soon" stubs** — no placeholder legal text was drafted, per your call in
Week B.

**A few response shapes are typed `unknown` on purpose**, not guessed:
`dashboardLogin`, `registerTenant`, `updateTenantSettings`,
`rotateApiKeys` all document their request/side-effects in the API doc
but not their exact success payload. Each has a comment explaining why.

---

## 6. What actually got tested vs. what's compile-verified only

Every single change across all four weeks was verified with a real
`next build` (zero TS errors, correct static/dynamic route marking) in a
sandboxed environment with no live API and no browser. That means:

- **Structurally solid, functionally unverified against a live backend**:
  the entire auth flow (register -> verify -> login -> reset), Settings,
  API Keys, Users, Audit Log — all compile clean and are written against
  the documented contracts, but hadn't touched a running `api` instance
  until your Day 4 walkthrough.
- **You've now confirmed** the full register -> verify -> sign-in path
  works end-to-end against the real backend with no bugs found.
- **GSAP animation timing/feel was never visually verified** by me at
  any point — no browser was available in the build environment. Worth a
  deliberate look if "smooth and sleek as hell" hasn't been explicitly
  checked yet.

---

## 7. Suggested next steps, roughly in order of value

1. Verify `TenantUser`/`PaginatedUsers` field names against the real
   `GET /dashboard/users` response — highest-risk unconfirmed contract.
2. Build the three `/dashboard/analytics/*` endpoints server-side; the
   frontend is ready and waiting.
3. Decide on the Card/border contrast trade-off (heavier borders vs. a
   different boundary technique) and apply it as a deliberate token
   change, not a one-off patch.
4. Fill in real social URLs / contact email in `MarketingFooter.tsx`, and
   real Privacy/Terms content, before this goes anywhere public-facing.
5. Consider whether a `GET` endpoint for the current public key should
   exist — right now it's genuinely only ever shown once, which is an
   unusual choice for a non-secret value.