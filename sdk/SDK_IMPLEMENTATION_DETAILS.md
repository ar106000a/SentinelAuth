# SentinelAuth SDK Implementation Specification & Component Architecture

This document provides a comprehensive technical reference for `@sentinelauth/sdk`. It details the core client runtime, single-flight token refresh manager, automatic 401 interception logic, FingerprintJS integration, and the complete Web Component library.

---

## Table of Contents
1. [SDK Architecture & Package Structure](#1-sdk-architecture--package-structure)
2. [Core SDK Client (`src/index.ts` & `src/client.ts`)](#2-core-sdk-client)
   - [Configuration (`SentinelAuthConfig`)](#configuration-sentinelauthconfig)
   - [HTTP Client & Automatic 401 Interception (`HttpClient`)](#http-client--automatic-401-interception-httpclient)
   - [SDK Event Emitter (`SentinelAuth extends EventTarget`)](#sdk-event-emitter-sentinelauth-extends-eventtarget)
3. [Session & Token Management (`src/session-manager.ts`)](#3-session--token-management)
   - [In-Memory Token Access](#in-memory-token-access)
   - [Single-Flight Guarded Refresh (`refreshIfNeeded`)](#single-flight-guarded-refresh-refreshifneeded)
   - [HttpOnly Cookie Alignment](#httponly-cookie-alignment)
4. [Device Fingerprinting (`src/fingerprint.ts`)](#4-device-fingerprinting)
   - [FingerprintJS Integration & Dual-Layer Caching](#fingerprintjs-integration--dual-layer-caching)
   - [Non-Blocking Fail-Safe Mechanism (`tryGetDeviceFingerprint`)](#non-blocking-fail-safe-mechanism-trygetdevicefingerprint)
5. [Web Component Architecture (`src/components/`)](#5-web-component-architecture)
   - [Shadow DOM & Custom Elements Standards](#shadow-dom--custom-elements-standards)
   - [CSS Custom Properties & Customization System](#css-custom-properties--customization-system)
   - [SDK Instance Wiring Protocol (`setSdk`)](#sdk-instance-wiring-protocol-setsdk)
   - [Composed Custom Events](#composed-custom-events)
6. [Web Component Catalog Reference](#6-web-component-catalog-reference)
   - [`<sentinel-auth-login>` (`login-form.ts`)](#sentinel-auth-login-login-formts)
   - [`<sentinel-auth-otp>` (`otp-input.ts`)](#sentinel-auth-otp-otp-inputts)
   - [`<sentinel-auth-flow>` (`auth-flow.ts`)](#sentinel-auth-flow-auth-flowts)
   - [`<sentinel-auth-register>` (`register-form.ts`)](#sentinel-auth-register-register-formts)
   - [`<sentinel-auth-register-flow>` (`register-flow.ts`)](#sentinel-auth-register-flow-register-flowts)
   - [`<sentinel-auth-forgot-password>` (`forgot-password-form.ts`)](#sentinel-auth-forgot-password-forgot-password-formts)
   - [`<sentinel-auth-reset-password>` (`reset-password-form.ts`)](#sentinel-auth-reset-password-reset-password-formts)
   - [`<sentinel-auth-password-reset-flow>` (`password-reset-flow.ts`)](#sentinel-auth-password-reset-flow-password-reset-flowts)
   - [`<sentinel-auth-mfa-setup>` (`mfa-setup.ts`)](#sentinel-auth-mfa-setup-mfa-setupts)
   - [`<sentinel-auth-logout-button>` (`logout-button.ts`)](#sentinel-auth-logout-button-logout-buttonts)
   - [`<sentinel-auth-mfa-disable>` (`mfa-disable.ts`)](#sentinel-auth-mfa-disable-mfa-disablets)

---

## 1. SDK Architecture & Package Structure

The `@sentinelauth/sdk` package provides a unified client library for web applications integrating with the SentinelAuth API. It features a dual-export structure:
- **`@sentinelauth/sdk`** (`dist/index.js`, `dist/index.mjs`): Headless TypeScript client class (`SentinelAuth`), session manager, error types, and fingerprinting tools.
- **`@sentinelauth/sdk/components`** (`dist/components.js`, `dist/components.mjs`): Autonomous Shadow DOM Web Components encapsulating login, registration, MFA, password reset, and logout UI flows.

### Build Target (`package.json`):
Compiled via `tsup` targeting both CommonJS (`cjs`) and ES Modules (`esm`) with generated TypeScript declaration files (`.d.ts`).

---

## 2. Core SDK Client

### Configuration (`SentinelAuthConfig`)

```typescript
export interface SentinelAuthConfig {
  apiUrl: string; // Base URL of SentinelAuth API (e.g., "http://localhost:3000")
  apiKey: string; // Tenant API Secret Key (passed as Bearer token in Authorization header)
}
```

### HTTP Client & Automatic 401 Interception (`HttpClient`)

All HTTP communication passes through the internal `HttpClient` class (`src/client.ts`).

#### Features:
1. **Credentials Inclusion**: Every request sets `credentials: "include"`, allowing the browser to attach HttpOnly refresh cookies (`sentinel_refresh`) automatically across origins.
2. **Tenant Key Authorization**: Automatically appends header `Authorization: Bearer ${this.apiKey}` to every outgoing HTTP request.
3. **Automatic 401 Interception & Single Retry**:
   - When a request containing the `X-User-Token` header receives an HTTP `401 Unauthorized` status response, `HttpClient` intercepts the response before throwing an error.
   - It checks `if (isUserAuthenticated && is401 && !isRetry && this.sessionManager)`.
   - It invokes `sessionManager.refreshIfNeeded()`.
   - If token refresh succeeds, it updates the `X-User-Token` header with the newly issued access token and retries the request **exactly once** (`isRetry = true`).
   - If the retried request fails with 401 again, or if the refresh attempt fails, the original error is surfaced to prevent infinite retry loops.
   - Unauthenticated requests (e.g. `login`, `register`, `forgotPassword`) do NOT send `X-User-Token` and will never trigger auto-refresh on 401.

### SDK Event Emitter (`SentinelAuth extends EventTarget`)

`SentinelAuth` extends the standard browser `EventTarget`.
- On session expiration (when automatic token refresh fails), `SessionManager` fires `onSessionExpired()`.
- `SentinelAuth` dispatches a custom DOM event `"session-expired"`. Application code can subscribe to this event to redirect users to login:
  ```typescript
  const sentinel = new SentinelAuth({ apiUrl, apiKey });
  sentinel.addEventListener("session-expired", () => {
    window.location.href = "/login";
  });
  ```

---

## 3. Session & Token Management (`src/session-manager.ts`)

The `SessionManager` class manages the in-memory access token lifecycle.

### In-Memory Token Access
- Access tokens are kept strictly in-memory (`private accessToken: string | null = null`) to protect against XSS token exfiltration.
- `setAccessToken(token: string)`: Updates current active token.
- `getAccessToken()`: Returns current active token or `null`.
- `clearSession()`: Resets `accessToken` and `refreshPromise` to `null`.

### Single-Flight Guarded Refresh (`refreshIfNeeded`)
When multiple API requests trigger simultaneous 401 responses or when multiple components request a token refresh at the same time, `SessionManager` uses a single-flight concurrency barrier (`refreshPromise`):

```typescript
async refreshIfNeeded(): Promise<string> {
  if (this.refreshPromise) {
    return this.refreshPromise;
  }
  this.refreshPromise = this.doRefresh();
  try {
    return await this.refreshPromise;
  } finally {
    this.refreshPromise = null;
  }
}
```
All concurrent calls join and await the exact same underlying `doRefresh()` execution.

### HttpOnly Cookie Alignment
The SDK JavaScript code cannot read or manipulate the refresh token because it is stored in an HttpOnly cookie (`sentinel_refresh`). `SessionManager.doRefresh()` executes `POST /api/auth/refresh` with an empty JSON body and relies on browser `credentials: "include"` header handling.

---

## 4. Device Fingerprinting (`src/fingerprint.ts`)

### FingerprintJS Integration & Dual-Layer Caching
Device fingerprinting uses `@fingerprintjs/fingerprintjs` (`^5.2.0`).
- **Caching**: Fingerprint calculation executes canvas and audio context tests, which are CPU-intensive. The resulting `visitorId` string is cached in memory (`cachedFingerprint`).
- **In-Flight Guarantee**: Concurrent calls reuse the active promise (`cachedPromise`), preventing FingerprintJS from initializing multiple browser probes simultaneously.

### Non-Blocking Fail-Safe Mechanism (`tryGetDeviceFingerprint`)
Fingerprinting can fail in restrictive privacy browsers (Brave, Firefox Strict) or sandboxed iframes. `tryGetDeviceFingerprint()` wraps `getDeviceFingerprint()` in a try/catch and returns `null` on failure. Fingerprinting is treated as a risk scoring input, never a blocking credential.

---

## 5. Web Component Architecture (`src/components/`)

### Shadow DOM & Custom Elements Standards
Every component extends `HTMLElement`, invokes `this.attachShadow({ mode: "open" })`, and defines a custom HTML tag via `customElements.define()`.

### CSS Custom Properties & Customization System
Components are fully themeable via CSS variables injected into the host application or shadow boundary:

```css
:host {
  --sentinel-font-family: system-ui, -apple-system, sans-serif;
  --sentinel-primary-color: #2563eb;
  --sentinel-primary-hover-color: #1d4ed8;
  --sentinel-error-color: #dc2626;
  --sentinel-success-color: #16a34a;
  --sentinel-text-color: #1f2937;
  --sentinel-muted-text-color: #6b7280;
  --sentinel-border-color: #d1d5db;
  --sentinel-background-color: #ffffff;
  --sentinel-border-radius: 8px;
  --sentinel-spacing: 1rem;
  --sentinel-padding: 1.5rem;
  --sentinel-max-width: 360px;
}
```

### SDK Instance Wiring Protocol (`setSdk`)
Web components cannot receive complex JavaScript class instances via HTML string attributes. Components expose a mandatory method:
```typescript
component.setSdk(sentinelAuthInstance);
```

### Composed Custom Events
All component events set `bubbles: true` and `composed: true`, allowing events to cross the Shadow DOM boundary and be captured anywhere in the outer DOM tree.

---

## 6. Web Component Catalog Reference

### `<sentinel-auth-login>` (`src/components/login-form.ts`)
- **Tag**: `sentinel-auth-login`
- **Description**: Renders email & password inputs, sign-in button, error display, and "Forgot password?" trigger.
- **Events Emitted**:
  - `sentinel-login-success` (`detail: LoginResponse`): Fired on successful login.
  - `sentinel-login-error` (`detail: { message: string }`): Fired on login failure.
  - `sentinel-forgot-password-requested`: Fired when clicking "Forgot password?".

---

### `<sentinel-auth-otp>` (`src/components/otp-input.ts`)
- **Tag**: `sentinel-auth-otp`
- **Description**: 6-digit numeric input with auto-advance, backspace navigation, arrow key navigation, paste parsing, and error animation.
- **Exposed Shadow Part**: `::part(submit)` — Allows parent components to hide or customize the submit button.
- **Methods**:
  - `readOtp()`: Returns current 6-digit string.
  - `showError(message: string)`: Highlights input borders in red, clears values, focuses first box.
  - `reset()`: Empties boxes, resets state, focuses box 1.
  - `finishSubmitting()`: Restores submit button enabled state.
- **Events Emitted**:
  - `sentinel-otp-submit` (`detail: { code: string }`): Fired when 6 digits are complete and submitted.

---

### `<sentinel-auth-flow>` (`src/components/auth-flow.ts`)
- **Tag**: `sentinel-auth-flow`
- **Description**: Two-step authentication orchestrator combining `<sentinel-auth-login>` and `<sentinel-auth-otp>`.
- **Workflow**:
  1. Displays `<sentinel-auth-login>`.
  2. If `LoginResponse` returns `mfaRequired: false`, dispatches `sentinel-auth-complete`.
  3. If `mfaRequired: true`, captures `sessionChallenge`, switches view to MFA step (`<sentinel-auth-otp>`), and completes authentication via `sdk.verifyMfa(sessionChallenge, code)`.
- **Events Emitted**:
  - `sentinel-auth-complete` (`detail: LoginResponse | MfaVerifyResponse`)

---

### `<sentinel-auth-register>` (`src/components/register-form.ts`)
- **Tag**: `sentinel-auth-register`
- **Description**: User registration form with email, password, and confirm password fields.
- **Features**: Real-time password match validation. Maps API error codes to specific input fields (e.g. `CONFLICT` -> email field; breach `VALIDATION_ERROR` -> password hint).
- **Events Emitted**:
  - `sentinel-register-success` (`detail: { email: string, response: UserRegistrationResponse }`)
  - `sentinel-register-error` (`detail: { message: string, code: string }`)

---

### `<sentinel-auth-register-flow>` (`src/components/register-flow.ts`)
- **Tag**: `sentinel-auth-register-flow`
- **Description**: Two-step registration flow orchestrator.
- **Workflow**:
  1. Displays `<sentinel-auth-register>`.
  2. On registration success, switches to email verification step (`<sentinel-auth-otp>`).
  3. Executes `sdk.verifyEmail(pendingEmail, code)`.
- **Events Emitted**:
  - `sentinel-register-complete` (`detail: { email: string, response: UserVerifyEmailResponse }`)

---

### `<sentinel-auth-forgot-password>` (`src/components/forgot-password-form.ts`)
- **Tag**: `sentinel-auth-forgot-password`
- **Description**: Password reset request form.
- **Privacy Preservation**: Shows identical success message whether email exists or not to preserve API account enumeration protection.
- **Events Emitted**:
  - `sentinel-forgot-password-sent` (`detail: { email: string }`)
  - `sentinel-forgot-password-error` (`detail: { message: string }`)

---

### `<sentinel-auth-reset-password>` (`src/components/reset-password-form.ts`)
- **Tag**: `sentinel-auth-reset-password`
- **Description**: Form combining `<sentinel-auth-otp>` with new password & confirm password inputs.
- **Styling**: Hides internal OTP button (`sentinel-auth-otp::part(submit) { display: none; }`) and submits code + new password together via `sdk.resetPassword(email, code, newPassword)`.
- **Methods**:
  - `setEmail(email: string)`
  - `reset()`
- **Events Emitted**:
  - `sentinel-reset-password-success` (`detail: { email: string, message: string }`)
  - `sentinel-reset-password-error` (`detail: { message: string }`)

---

### `<sentinel-auth-password-reset-flow>` (`src/components/password-reset-flow.ts`)
- **Tag**: `sentinel-auth-password-reset-flow`
- **Description**: Flow orchestrator linking `<sentinel-auth-forgot-password>` to `<sentinel-auth-reset-password>`. Passes `email` seamlessly between steps.
- **Events Emitted**:
  - `sentinel-password-reset-complete` (`detail: { email: string, message: string }`)

---

### `<sentinel-auth-mfa-setup>` (`src/components/mfa-setup.ts`)
- **Tag**: `sentinel-auth-mfa-setup`
- **Description**: Interactive TOTP MFA setup component.
- **Workflow**:
  1. Displays QR Code image Data URI and Base32 secret string.
  2. Clicking "Continue" transitions to verification step (`<sentinel-auth-otp>`).
  3. Verifies code via `sdk.enableMfa(accessToken, code)`.
- **Methods**:
  - `start()`: Initiates MFA setup by fetching QR code and secret from SDK.
- **Events Emitted**:
  - `sentinel-mfa-setup-complete`

---

### `<sentinel-auth-logout-button>` (`src/components/logout-button.ts`)
- **Tag**: `sentinel-auth-logout-button`
- **Description**: Single-action logout button element.
- **Workflow**: Reads active access token from SDK (`sdk.getAccessToken()`), calls `sdk.logout(accessToken)`, clears local session.
- **Events Emitted**:
  - `sentinel-logout-complete` (`detail: { message: string }`)
  - `sentinel-logout-error` (`detail: { message: string }`)

---

### `<sentinel-auth-mfa-disable>` (`src/components/mfa-disable.ts`)
- **Tag**: `sentinel-auth-mfa-disable`
- **Description**: MFA deactivation component.
- **Workflow**: Collects user password and 6-digit TOTP code via embedded `<sentinel-auth-otp>`. Calls `sdk.disableMfa(accessToken, password, code)`.
- **Events Emitted**:
  - `sentinel-mfa-disable-complete` (`detail: { message: string }`)
  - `sentinel-mfa-disable-error` (`detail: { message: string }`)
