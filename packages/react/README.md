# @sentinelauth/react

React and Next.js bindings for the SentinelAuth SDK. Wraps SentinelAuth's
themeable Web Components with idiomatic hooks and components — no refs,
no manual event wiring, no manual SSR guards required.

## Installation

\`\`\`bash
npm install @sentinelauth/react @sentinelauth/sdk
\`\`\`

## Quick start

\`\`\`tsx
import { SentinelAuthProvider, SentinelAuthLoginFlow } from "@sentinelauth/react";

function App() {
  return (
    <SentinelAuthProvider apiUrl="https://your-api.com" apiKey="your-tenant-key">
      <SentinelAuthLoginFlow
        onSuccess={(result) => console.log("Logged in:", result)}
        onError={(err) => console.error(err.message)}
      />
    </SentinelAuthProvider>
  );
}
\`\`\`

## Server-side rendering behavior — read this before deploying

Every wrapped component in this package renders **nothing** during
server-side rendering, and on the very first client render, before
hydration completes. Content appears a moment later, once the browser
has loaded the underlying Web Components module.

**Why:** SentinelAuth's Web Components extend `HTMLElement`, a
browser-only API. Importing that module during server-side rendering
crashes — there is no `HTMLElement` in Node. This package works around
that by deferring the import to run only inside `useEffect`, which is
guaranteed to execute client-side only.

**What this means in practice:**
- No SentinelAuth form content is present in the raw server-rendered
  HTML. A search engine crawler or any tool reading server HTML
  without executing JavaScript will not see your login form's markup.
- The gap between initial paint and the form appearing is small in
  practice (a cached module import resolving in milliseconds), but it
  is not zero. If you need the absolute fastest possible time-to-form,
  consider a loading skeleton around these components while you await
  a future release with true SSR-rendered markup.
- Tested and confirmed working correctly under: `next dev`, `next
  build` + `next start` (standard Node server output), and `next
  build` with `output: "export"` (fully static hosting, e.g. behind a
  CDN with no server at all).

This is a deliberate, documented tradeoff — not a bug.

## Components

- `<SentinelAuthLoginFlow>` — login, with automatic MFA challenge handling
- `<SentinelAuthRegisterFlow>` — registration + email verification
- `<SentinelAuthPasswordResetFlow>` — forgot password + reset
- `<SentinelAuthMfaSetup>` — MFA enrollment (QR code + confirmation).
  Exposes an imperative `start()` method via ref — setup does not begin
  automatically on mount.
- `<SentinelAuthMfaDisable>` — MFA removal (password + code required)
- `<SentinelAuthLogoutButton>` — session termination

All components accept `onSuccess` and `onError` props. `onError` is
only genuinely invoked on components whose underlying SDK element
dispatches a dedicated top-level error event (`MfaDisable`,
`LogoutButton` today) — the flow-orchestrator components surface
errors inline on their internal form fields instead, by design, so
`onError` on those is present for interface consistency but not
currently wired to anything.

## Headless usage

For fully custom UI, use the underlying hook directly instead of any
wrapped component:

\`\`\`tsx
import { useSentinelAuth } from "@sentinelauth/react";

function CustomLoginForm() {
  const { login } = useSentinelAuth();
  // build your own form, call login(email, password) yourself
}
\`\`\`