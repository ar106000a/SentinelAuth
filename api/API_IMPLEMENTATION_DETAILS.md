# SentinelAuth API Implementation Specification & Architecture Reference

This document provides a comprehensive, low-level technical specification of the `@sentinelauth/api` package. It details every architectural component, database schema, cryptographic scheme, middleware sequence, service method, authentication protocol, and risk assessment pipeline.

---

## Table of Contents
1. [Technology Stack & System Dependencies](#1-technology-stack--system-dependencies)
2. [Environment Configuration & Validation (`src/config/env.ts`)](#2-environment-configuration--validation)
3. [Database Architecture & Multi-Tenancy Strategy](#3-database-architecture--multi-tenancy-strategy)
   - [Database Connection Pools (`src/db/index.ts`)](#database-connection-pools)
   - [Row-Level Security (RLS) & `withTenant` Helper (`src/db/with-tenant.ts`)](#row-level-security-rls--withtenant-helper)
   - [Entity Schemas (`src/db/schema/`)](#entity-schemas)
4. [Cryptographic Architecture (`src/utils/crypto.ts` & `src/utils/jwt.ts`)](#4-cryptographic-architecture)
   - [Password Hashing (Argon2id)](#password-hashing-argon2id)
   - [RSA Keypair Generation & Master Key Encryption (AES-256-OCB)](#rsa-keypair-generation--master-key-encryption-aes-256-ocb)
   - [JWT Sign & Verification (RS256 & HS256)](#jwt-sign--verification-rs256--hs256)
   - [Have I Been Pwned (HIBP) Password Integration](#have-i-been-pwned-hibp-password-integration)
5. [Risk Analysis, Anomaly Detection & MFA Engine](#5-risk-analysis-anomaly-detection--mfa-engine)
   - [Feature Vector Assembly](#feature-vector-assembly)
   - [AI Risk Engine Interface & Fail-Open Strategy](#ai-risk-engine-interface--fail-open-strategy)
   - [Geo Velocity & Impossible Travel Detection](#geo-velocity--impossible-travel-detection)
   - [Velocity Anomaly & Multi-IP Flagging](#velocity-anomaly--multi-ip-flagging)
   - [Device Fingerprinting](#device-fingerprinting)
   - [Credential Stuffing Guard](#credential-stuffing-guard)
6. [Rate Limiting & Redis Token Bucket (`src/lib/rate-limiter.ts`)](#6-rate-limiting--redis-token-bucket)
7. [HTTP Application Setup & Middleware Pipeline (`src/index.ts`)](#7-http-application-setup--middleware-pipeline)
   - [Middleware Sequence](#middleware-sequence)
   - [Middleware Implementations (`src/middleware/`)](#middleware-implementations)
8. [API Route Specifications & Request/Response Flows](#8-api-route-specifications--requestresponse-flows)
   - [Health Route (`/health`)](#health-route)
   - [Tenant Management Routes (`/tenants`)](#tenant-management-routes)
   - [Dashboard Routes (`/dashboard`)](#dashboard-routes)
   - [End-User Authentication Routes (`/api/auth`)](#end-user-authentication-routes)
9. [Error Handling Architecture (`src/utils/error.ts` & `response.ts`)](#9-error-handling-architecture)
10. [Data Types & Shared Contracts (`@sentinelauth/types`)](#10-data-types--shared-contracts)

---

## 1. Technology Stack & System Dependencies

- **HTTP Framework**: [Hono](https://hono.dev/) `v4.12.16` running on Node.js via `@hono/node-server` `v2.0.1`.
- **Database & ORM**: PostgreSQL `pg` `v8.20.0` managed via [Drizzle ORM](https://orm.drizzle.team/) `v0.45.2` and `drizzle-kit` `v0.31.10`.
- **Cache & State Store**: Redis via `ioredis` `v5.10.1`. Used for token-bucket rate limiting, sliding window credential stuffing counters, and multi-IP velocity anomaly tracking.
- **Cryptographic Libraries**:
  - `argon2` `v0.44.0` for password hashing (Argon2id algorithm).
  - `node-forge` `v1.4.0` for RSA-2048 keypair generation.
  - Native Node.js `crypto` module for AES-256-OCB encryption/decryption, SHA-256/SHA-1 hashing, and cryptographically secure random values.
  - `jsonwebtoken` `v9.0.3` for signing and verifying RS256 Access Tokens and HS256 Refresh Tokens.
  - `otplib` `v13.4.1` for TOTP (Time-based One-Time Password) secret generation and verification.
  - `qrcode` `v1.5.4` for generating base64 QR Code Data URIs for TOTP setup.
- **Validation**: `zod` `v4.4.1` for schema validation across environment variables, route bodies, query strings, and JWT payloads.
- **Email Delivery**: Google APIs client (`googleapis` `v171.4.0`) via Gmail API v1 with OAuth2 refresh token workflow.
- **Geolocation**: `geoip-lite` `v2.0.3` for resolving client IPv4/IPv6 addresses into latitude, longitude, city, and country.
- **HTTP Client**: `axios` `v1.16.1` for external API communication (HIBP and AI Risk Engine).

---

## 2. Environment Configuration & Validation (`src/config/env.ts`)

Environment variables are loaded from the workspace root `.env` using `dotenv`. Strict runtime validation is enforced at process start using Zod. If validation fails, process execution halts immediately (`process.exit(1)`).

### Schema Specification:

| Variable | Type / Format | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | `z.url()` | *Required* | PostgreSQL connection string for superuser/admin pool (bypasses RLS). |
| `DATABASE_APP_URL` | `z.url()` | *Required* | PostgreSQL connection string for application pool (enforces RLS). |
| `REDIS_URL` | `z.url()` | *Required* | Connection string for Redis instance. |
| `PORT` | `number` | `3000` | HTTP listening port for Hono server. |
| `NODE_ENV` | `enum("development", "test", "production")` | `"development"` | Runtime execution environment. |
| `JWT_ACCESS_EXPIRY` | `string` | `"15m"` | Expiry duration for RS256 user access JWTs. |
| `JWT_REFRESH_EXPIRY` | `string` | `"7d"` | Expiry duration for HS256 refresh tokens. |
| `MFA_OTP_EXPIRY_MINUTES` | `number` | `10` | Expiry duration for email OTP tokens. |
| `ARGON2_MEMORY_COST` | `number` | `65536` (64 MB) | Argon2id memory cost parameter. |
| `ARGON2_TIME_COST` | `number` | `3` | Argon2id iterations time cost parameter. |
| `HIBP_TIMEOUT_MS` | `number` | `5000` | Axios timeout for Have I Been Pwned API calls. |
| `GMAIL_CLIENT_ID` | `string` | `undefined` (Optional) | OAuth2 Client ID for Gmail API. |
| `GMAIL_CLIENT_SECRET` | `string` | `undefined` (Optional) | OAuth2 Client Secret for Gmail API. |
| `GMAIL_REFRESH_TOKEN` | `string` | `undefined` (Optional) | OAuth2 Refresh Token for Gmail API. |
| `GMAIL_SENDER` | `email` | `undefined` (Optional) | Sender email address for outgoing emails. |
| `MASTER_ENCRYPTION_KEY` | `string` (min 64 hex chars) | Hex string (or `0` * 64 in `test`) | 32-byte hex key used for AES-256-OCB master encryption of tenant RSA private keys and user MFA TOTP secrets. |
| `JWT_ISSUER` | `string` | `"sentinelauth"` | JWT `iss` claim issuer identifier. |
| `JWT_REFRESH_SECRET` | `string` (min 64 chars) | *Required* | HMAC secret used to sign HS256 refresh tokens. |
| `COOKIE_SECRET` | `string` (min 64 chars) | *Required* | Secret key for signed cookie verification. |
| `COOKIE_DOMAIN` | `string` | `"localhost"` | Cookie domain scope. |
| `AI_ENGINE_URL` | `z.url()` | `"http://localhost:8000"` | Base URL of external Python AI Risk Inference microservice. |
| `AI_ENGINE_TIMEOUT_MS` | `number` | `5000` | Axios timeout for AI risk inference request. |

---

## 3. Database Architecture & Multi-Tenancy Strategy

### Database Connection Pools (`src/db/index.ts`)

SentinelAuth employs two distinct PostgreSQL connection pools:

1. **`adminPool` / `adminDb`**:
   - Connection: Uses `DATABASE_URL` (DB superuser credentials).
   - Max Connections: `5`.
   - Purpose: Reserved for database migrations, tenant registration, background administrative operations, and cross-tenant auditing (e.g., system risk logs). Bypasses PostgreSQL Row-Level Security (RLS).
2. **`pool` / `db`**:
   - Connection: Uses `DATABASE_APP_URL` (Restricted app user credentials).
   - Max Connections: `20`.
   - Purpose: Used for all tenant-scoped API request operations. Strict RLS policy enforcement.

### Row-Level Security (RLS) & `withTenant` Helper (`src/db/with-tenant.ts`)

Multi-tenancy isolation is enforced at the database layer via PostgreSQL RLS policies that inspect the dynamic session variable `app.current_tenant`.

```typescript
export async function withTenant<T>(
  tenantId: string,
  callback: (client: PoolClient) => Promise<T>
): Promise<T>
```
**Execution Lifecycle**:
1. Checks out a client connection from `pool`.
2. Issues `BEGIN` to start a PostgreSQL transaction.
3. Executes `SELECT set_config('app.current_tenant', $1, true)` with `tenantId`. The `true` parameter sets `is_local = true`, scoping the configuration variable strictly to the duration of the current transaction. This prevents session context bleeding when the connection returns to the connection pool.
4. Executes the callback function using a tenant-scoped Drizzle instance: `drizzle(client, { schema })`.
5. On success: Issues `COMMIT`.
6. On failure: Issues `ROLLBACK` and re-throws the error.
7. `finally`: Releases the client connection back to `pool`.

### Entity Schemas (`src/db/schema/`)

#### 1. `tenants` (`src/db/schema/tenants.ts`)
Stores tenant (organization/application owner) accounts.
- `id` (`uuid`, Primary Key, `defaultRandom()`)
- `name` (`text`, Not Null)
- `adminEmail` (`text`, Not Null, Unique)
- `passwordHash` (`text`, Not Null) — Argon2id hash.
- `publicKey` (`text`, Not Null) — RSA 2048-bit Public Key in PEM format.
- `secretKeyHash` (`text`, Not Null) — SHA-256 hash of the tenant's API Secret Key.
- `settings` (`jsonb`, Not Null, default: `{ riskThreshold: 0.7, failOpen: true }`)
- `isVerified` (`boolean`, Not Null, default: `false`)
- `privateKeyEncrypted` (`text`, Not Null, default: `"sample"`) — AES-256-OCB encrypted RSA Private Key.
- `createdAt` (`timestamp`, defaultNow())
- `updatedAt` (`timestamp`, defaultNow())

#### 2. `users` (`src/db/schema/users.ts`)
Stores end-user accounts created under specific tenants.
- `id` (`uuid`, Primary Key, `defaultRandom()`)
- `tenantId` (`uuid`, Foreign Key -> `tenants.id`, `ON DELETE CASCADE`)
- `email` (`text`, Not Null)
- `passwordHash` (`text`, Not Null) — Argon2id hash.
- `isVerified` (`boolean`, Not Null, default: `false`)
- `mfaEnabled` (`boolean`, Not Null, default: `false`)
- `mfaSecret` (`text`, Nullable) — AES-256-OCB encrypted 32-character Base32 TOTP secret.
- `lastLoginAt` (`timestamp`, Nullable)
- `lastLoginIp` (`text`, Nullable)
- `lastLoginLat` (`text`, Nullable)
- `lastLoginLng` (`text`, Nullable)
- `loginHourProfile` (`jsonb`, Nullable) — 24-element integer array tracking historical login frequencies by UTC hour (0-23).
- `createdAt` (`timestamp`, defaultNow())
- `updatedAt` (`timestamp`, defaultNow())

#### 3. `sessions` (`src/db/schema/sessions.ts`)
Active user JWT sessions.
- `id` (`uuid`, Primary Key, `defaultRandom()`)
- `tenantId` (`uuid`, Foreign Key -> `tenants.id`, `ON DELETE CASCADE`)
- `userId` (`uuid`, Foreign Key -> `users.id`, `ON DELETE CASCADE`)
- `tokenHash` (`text`, Not Null, Unique) — SHA-256 hash of the issued Access JWT.
- `isRevoked` (`boolean`, Not Null, default: `false`)
- `expiresAt` (`timestamp`, Not Null)
- `createdAt` (`timestamp`, defaultNow())

#### 4. `tenant_sessions` (`src/db/schema/tenant-sessions.ts`)
Active dashboard admin sessions.
- `id` (`uuid`, Primary Key, `defaultRandom()`)
- `tenantId` (`uuid`, Foreign Key -> `tenants.id`, `ON DELETE CASCADE`)
- `tokenHash` (`text`, Not Null, Unique) — SHA-256 hash of the random 32-byte hex session token stored in cookie `dashboard_session`.
- `expiresAt` (`timestamp`, Not Null)
- `createdAt` (`timestamp`, defaultNow())

#### 5. `device_fingerprints` (`src/db/schema/device-fingerprints.ts`)
Registered user device fingerprints.
- `id` (`uuid`, Primary Key, `defaultRandom()`)
- `tenantId` (`uuid`, Foreign Key -> `tenants.id`, `ON DELETE CASCADE`)
- `userId` (`uuid`, Foreign Key -> `users.id`, `ON DELETE CASCADE`)
- `fingerprintHash` (`text`, Not Null)
- `firstSeenAt` (`timestamp`, defaultNow())
- `lastSeenAt` (`timestamp`, defaultNow())

#### 6. `otp_tokens` (`src/db/schema/otp-tokens.ts`)
One-time tokens for email verification, password resets, and MFA login challenges.
- `id` (`uuid`, Primary Key, `defaultRandom()`)
- `tenantId` (`uuid`, Foreign Key -> `tenants.id`, `ON DELETE CASCADE`)
- `userId` (`uuid`, Foreign Key -> `users.id`, Nullable, `ON DELETE CASCADE`)
- `tokenHash` (`text`, Not Null) — SHA-256 hash of the OTP or session challenge.
- `type` (`text`, Not Null) — Values: `"email_verification"`, `"password_reset"`, `"mfa_challenge"`.
- `expiresAt` (`timestamp`, Not Null)
- `usedAt` (`timestamp`, Nullable)
- `createdAt` (`timestamp`, defaultNow())

#### 7. `risk_logs` (`src/db/schema/risk-logs.ts`)
Security audit log and risk telemetry repository.
- `id` (`uuid`, Primary Key, `defaultRandom()`)
- `tenantId` (`uuid`, Foreign Key -> `tenants.id`, `ON DELETE CASCADE`)
- `userId` (`uuid`, Foreign Key -> `users.id`, Nullable, `ON DELETE SET NULL`) — Set to NULL on GDPR delete.
- `eventType` (`text`, Not Null)
- `riskScore` (`real`, Nullable)
- `mfaTriggered` (`boolean`, Not Null, default: `false`)
- `ipAddress` (`text`, Nullable)
- `userAgent` (`text`, Nullable)
- `fingerprint` (`text`, Nullable)
- `geoLat` (`text`, Nullable)
- `geoLng` (`text`, Nullable)
- `features` (`jsonb`, Nullable) — Stores complete feature vector (`Record<string, number>`).
- `createdAt` (`timestamp`, defaultNow())

---

## 4. Cryptographic Architecture

### Password Hashing (Argon2id)
Passwords for both tenant admins and end-users are hashed using Argon2id (`argon2.argon2id`):
```typescript
argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: env.ARGON2_MEMORY_COST, // Default 65536 KB (64MB)
  timeCost: env.ARGON2_TIME_COST,     // Default 3 iterations
  parallelism: 1,
});
```

### RSA Keypair Generation & Master Key Encryption (AES-256-OCB)
During tenant verification or key rotation, a 2048-bit RSA keypair is generated via `node-forge` (`e = 0x10001`). 
- The **Public Key** is stored unencrypted in PEM format in `tenants.publicKey`.
- The **Private Key** is encrypted before DB storage using AES-256-OCB authenticated encryption (`crypto.createCipheriv("aes-256-ocb", key, iv, { authTagLength: 16 })`):
  - Key: Derived from `env.MASTER_ENCRYPTION_KEY` (32 bytes hex decoded).
  - IV: 15 bytes random (`randomBytes(15)`).
  - Format stored in DB: `${ivHex}:${encryptedHex}:${tagHex}`.
- TOTP MFA secrets (`users.mfaSecret`) use the identical AES-256-OCB encryption functions (`encryptMfaSecret` / `decryptMfaSecret`).

### JWT Sign & Verification (RS256 & HS256)

1. **Access Token (RS256)**:
   - Signed using the tenant's decrypted RSA Private Key.
   - Verified using the tenant's RSA Public Key.
   - Header/Payload format:
     ```json
     {
       "alg": "RS256",
       "typ": "JWT",
       "jti": "<uuid>",
       "iss": "sentinelauth",
       "sub": "<userId>",
       "tenantId": "<tenantId>",
       "email": "<userEmail>",
       "isVerified": true,
       "iat": 1700000000,
       "exp": 1700000900
     }
     ```
   - Lifetime: Defined by `env.JWT_ACCESS_EXPIRY` (default `15m`).
   - Tracked in `sessions` table by saving the SHA-256 hash of the JWT string (`tokenHash`).

2. **Refresh Token (HS256)**:
   - Signed using HMAC-SHA256 with global secret `env.JWT_REFRESH_SECRET`.
   - Payload format:
     ```json
     {
       "sub": "<userId>",
       "tenantId": "<tenantId>",
       "sessionId": "<sessionId>",
       "iss": "sentinelauth"
     }
     ```
   - Lifetime: Defined by `env.JWT_REFRESH_EXPIRY` (default `7d`).
   - Delivered to clients via HttpOnly cookie `sentinel_refresh`.

### Have I Been Pwned (HIBP) Password Integration
Before any password registration or reset (for both tenant admins and end-users), the password is evaluated against Have I Been Pwned using k-Anonymity:
1. Calculates SHA-1 hash of password (`createHash("sha1").update(password).digest("hex").toUpperCase()`).
2. Splices hash: `prefix = sha1.slice(0, 5)`, `suffix = sha1.slice(5)`.
3. Sends HTTP GET to `https://api.pwnedpasswords.com/range/${prefix}` with headers `Add-Padding: true` and `User-Agent: SentinelAuth-HIBP-Check`.
4. Parses line-delimited suffix responses (`HASH_SUFFIX:COUNT`). If a matching suffix is found, registration/reset is rejected with a `ValidationError`.
5. On connection timeout (`env.HIBP_TIMEOUT_MS`) or error: Fails open with a console warning.

---

## 5. Risk Analysis, Anomaly Detection & MFA Engine

### Feature Vector Assembly
During end-user login, a 10-dimensional feature vector is compiled:
```typescript
export interface LoginFeatureVector {
  ip_address: string;
  user_agent: string;
  login_hour: number;             // UTC hour 0-23
  fingerprint: string | null;     // Client-supplied device fingerprint string
  hour_frequency_score: number;   // Fraction of user's past logins occurring at this UTC hour
  geo_lat: number | null;         // Latitude from geoip-lite lookup
  geo_lng: number | null;         // Longitude from geoip-lite lookup
  geo_velocity_kmh: number;       // Calculated speed relative to previous login
  is_new_device: number;          // 1 if device fingerprint unseen for user, else 0
  velocity_anomaly: number;       // 1 if user accessed > 3 distinct IPs in 5 min, else 0
}
```

### AI Risk Engine Interface & Fail-Open Strategy
The assembled feature vector is transmitted via POST to `${env.AI_ENGINE_URL}/infer` with a timeout of `env.AI_ENGINE_TIMEOUT_MS` (default 5000ms).
- **Returned Body**: `{ risk_score: number, model_version: string }`.
- Score is clamped to range `[0.0, 1.0]`.
- **Fail-Open / Fail-Closed Logic**: If the AI Engine request fails or times out:
  - If tenant setting `failOpen === true`: Returns neutral score `0.5`.
  - If tenant setting `failOpen === false`: Returns maximum risk score `1.0` (triggering step-up MFA or blocking access).

### Geo Velocity & Impossible Travel Detection
- Uses `geoip-lite` to resolve client IP to `(lat, lng)`.
- Calculates distance between current location and `lastLoginLat`/`lastLoginLng` using the Haversine formula ($R = 6371\text{ km}$):
  $$\Delta\sigma = 2 \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta\phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta\lambda}{2}\right)}\right)$$
  $$d = R \cdot \Delta\sigma$$
- Computes velocity in km/h: $v = \frac{d}{\Delta t_{\text{hours}}}$.
- If $v > 900\text{ km/h}$ (commercial jet speed limit), an `impossible_travel_detected` risk log is inserted with feature diagnostics.

### Velocity Anomaly & Multi-IP Flagging (`src/lib/velocity-anomaly.ts`)
- Maintains a Redis Sorted Set at key `velocity:{tenantId}:{userId}`.
- Members: `ip`, Score: Unix timestamp.
- Sliding Window: 300 seconds (5 minutes). Old entries outside window are pruned via `zremrangebyscore`.
- If distinct IP count in 5 minutes (`zcard`) exceeds `3`, a forced MFA flag key `mfa_forced:{tenantId}:{userId}` is set in Redis with a 24-hour TTL (86400 seconds).

### Device Fingerprinting (`src/services/device-fingerprint.service.ts`)
- Evaluates `(tenantId, userId, fingerprintHash)` against `device_fingerprints` table.
- If existing: Updates `lastSeenAt` to current timestamp, returns `isNewDevice = false`.
- If non-existing: Inserts new record, returns `isNewDevice = true`.

### Credential Stuffing Guard (`src/lib/credential-stuffing.ts`)
- Evaluates client IP against Redis key `stuffing:{ip}` (Sorted Set).
- Member: `${timestamp}:${email}`, Score: Unix timestamp.
- Sliding Window: 600 seconds (10 minutes).
- If distinct targeted emails from the same IP $\ge 20$, the IP is blocked by setting `block:{ip}` in Redis with an 1800-second TTL (30 minutes).
- Requests from blocked IPs are intercepted by `credentialStuffingGuard` middleware, throwing a `RateLimitError` (HTTP 429) with `Retry-After` header set to remaining TTL.
- Successful login calls `recordSuccessfulLogin(ip)`, which clears `stuffing:{ip}`.

---

## 6. Rate Limiting & Redis Token Bucket (`src/lib/rate-limiter.ts`)

Per-tenant and per-IP rate limiting is executed via an atomic Lua script executed in Redis (`ratelimit:{key}`).

### Lua Script Algorithm:
```lua
local key = KEYS[1]
local now = tonumber(ARGV[1])
local max_tokens = tonumber(ARGV[2])
local refill_rate = tonumber(ARGV[3])
local window = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(bucket[1])
local last_refill = tonumber(bucket[2])

if tokens == nil then
  tokens = max_tokens
  last_refill = now
end

local elapsed = now - last_refill
local refill_amount = elapsed * refill_rate
tokens = math.min(max_tokens, tokens + refill_amount)
last_refill = now

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
redis.call('EXPIRE', key, window)

local reset_in = math.ceil((1 - tokens) / refill_rate)
if reset_in < 0 then reset_in = 0 end

return { allowed, math.floor(tokens), reset_in }
```

### Preset Configurations:
- **`DEFAULT_RATE_LIMIT`**: Applied to `/api/*`. `maxTokens: 100`, `refillRate: 10/sec`, `windowSeconds: 60`.
- **`AUTH_RATE_LIMIT`**: Applied to `/api/auth/*`. `maxTokens: 40`, `refillRate: 2/sec`, `windowSeconds: 60`.
- Key structure: `${apiKey}:${ip}`.
- Response Headers added to every request: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

---

## 7. HTTP Application Setup & Middleware Pipeline (`src/index.ts`)

### Middleware Sequence

Requests flow through middleware in the following order:

```
[Incoming Request]
       │
       ▼
 1. onError Handler (Global exception handler)
       │
       ▼
 2. logger() (Hono request/response logging)
       │
       ▼
 3. cors() (Origin: http://localhost:3001, Credentials: true)
       │
       ▼
 4. errorHandler (Try/catch wrapper for async downstream errors)
       │
       ▼
 5. requestId (Injects/reads X-Request-ID header)
       │
       ▼
 6. rateLimitMiddleware (/api/* -> DEFAULT_RATE_LIMIT, /api/auth/* -> AUTH_RATE_LIMIT)
       │
       ▼
 7. tenantContext (/api/* -> Validates Bearer Secret Key, sets tenantId/Name/Settings)
       │
       ▼
 8. Route Handlers (/health, /tenants, /dashboard, /api/auth)
```

### Middleware Implementations (`src/middleware/`)

- **`tenantContext` (`src/middleware/tenant-context.ts`)**:
  - Extracts `Authorization: Bearer <secretKey>`.
  - Hashes `<secretKey>` using SHA-256.
  - Queries `tenants` table for matching `secretKeyHash`.
  - Verifies `tenant.isVerified === true` (otherwise throws `ForbiddenError`).
  - Sets context variables: `c.set("tenantId")`, `c.set("tenantName")`, `c.set("tenantSettings")`.
- **`userAuth` (`src/middleware/user-auth.ts`)**:
  - Protects user-authenticated routes. Reads `X-User-Token` header.
  - Fetches tenant's `publicKey` from DB.
  - Verifies RS256 JWT signature and claims (`sub`, `tenantId`).
  - Computes SHA-256 hash of token string.
  - Runs DB lookup within `withTenant(tenantId)` RLS context: checks `sessions` table for matching `tokenHash` and `userId`.
  - Validates `isRevoked === false` and `new Date() <= expiresAt`.
  - Sets context variable: `c.set("userId")`.
- **`dashboardAuth` (`src/middleware/dashboard-auth.ts`)**:
  - Protects dashboard administration routes.
  - Reads cookie `dashboard_session`.
  - Hashes token string (SHA-256) and queries `tenant_sessions` table.
  - Validates session expiry.
  - Sets context variables: `c.set("tenantId")`, `c.set("tenantName")`, `c.set("tenantSettings")`.

---

## 8. API Route Specifications & Request/Response Flows

### Health Route

#### `GET /health`
- **Auth**: None.
- **Handler**: Pings Redis (`redis.ping()`) and PostgreSQL (`SELECT 1`).
- **Response** (`200 OK` or `503 Service Unavailable`):
  ```json
  {
    "status": "ok",
    "timestamp": "2026-08-19T15:00:00.000Z",
    "services": {
      "postgres": "healthy",
      "redis": "healthy"
    }
  }
  ```

---

### Tenant Management Routes (`/tenants`)

#### `POST /tenants/register`
- **Body**: `{ name: string, adminEmail: string, password: string (min 12) }`
- **Flow**: Validates body schema -> Checks HIBP database -> Checks if `adminEmail` exists -> Hashes password with Argon2id -> Inserts `tenants` record (`isVerified: false`) -> Generates 6-digit numeric OTP -> Inserts `otp_tokens` record -> Sends verification email via Gmail OAuth2 API.
- **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "data": { "message": "Registration successful. Check your email for a verification code." },
    "timestamp": "..."
  }
  ```

#### `POST /tenants/verify-email`
- **Body**: `{ adminEmail: string, otp: string (6 digits) }`
- **Flow**: Fetches unverified tenant -> Matches SHA-256 hash of OTP against `otp_tokens` -> Marks token `usedAt = NOW()` -> Generates 2048-bit RSA keypair -> Encrypts RSA private key via AES-256-OCB -> Generates 32-byte hex raw API Secret Key and SHA-256 hash -> Updates tenant (`isVerified: true`, `publicKey`, `secretKeyHash`, `privateKeyEncrypted`).
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "data": {
      "tenantId": "uuid",
      "publicKey": "-----BEGIN PUBLIC KEY-----\n...",
      "secretKey": "64-char-hex-string",
      "message": "Email verified. Store your secret key securely- it will not be shown again."
    },
    "timestamp": "..."
  }
  ```

#### `POST /tenants/forgot-password`
- **Body**: `{ adminEmail: string }`
- **Flow**: Queries tenant by admin email. If exists and verified: invalidates prior unused password reset tokens, generates new 6-digit OTP, inserts `otp_tokens` entry, dispatches email. Returns generic message to prevent email enumeration.

#### `POST /tenants/reset-password`
- **Body**: `{ adminEmail: string, otp: string, newPassword: string (min 12) }`
- **Flow**: Verifies OTP -> Performs HIBP check on `newPassword` -> Hashes new password with Argon2id -> Updates `tenants.passwordHash` -> Deletes all active `tenant_sessions` for tenant -> Logs `tenant_password_reset` event to `risk_logs`.

---

### Dashboard Routes (`/dashboard`)

#### `POST /dashboard/login`
- **Body**: `{ adminEmail: string, password: string }`
- **Flow**: Authenticates tenant admin credentials -> Generates random 32-byte hex session token -> Inserts SHA-256 hash into `tenant_sessions` (24h TTL) -> Sets HttpOnly, SameSite=Strict cookie `dashboard_session`.

#### `POST /dashboard/logout`
- **Middleware**: `dashboardAuth`
- **Flow**: Deletes session record from `tenant_sessions` matching `dashboard_session` cookie hash -> Deletes cookie.

#### `GET /dashboard/me`
- **Middleware**: `dashboardAuth`
- **Response**: `{ tenantId, tenantName, settings: { riskThreshold, failOpen } }`

#### `GET /dashboard/settings` & `PUT /dashboard/settings`
- **Middleware**: `dashboardAuth`
- **PUT Body**: `{ riskThreshold?: number (0.0 - 1.0), failOpen?: boolean }`
- **Flow**: Merges and validates settings object, updates `tenants.settings` JSONB column.

#### `POST /dashboard/keys/rotate`
- **Middleware**: `dashboardAuth`
- **Flow**: Generates new RSA 2048-bit keypair and new 32-byte API Secret Key -> Encrypts private key -> Updates tenant credentials in DB -> Revokes ALL active user sessions in `sessions` table (`isRevoked = true`) -> Logs `key_rotated` to `risk_logs` -> Returns new `publicKey` and `secretKey`.

#### `GET /dashboard/audit-logs`
- **Middleware**: `dashboardAuth`
- **Query Params**: `eventType`, `fromDate` (ISO), `toDate` (ISO), `page` (default 1), `limit` (default 20).
- **Flow**: Queries `risk_logs` joined with `users` on `userId` filtered by `tenantId`. Returns paginated list with total page count.

#### `GET /dashboard/users`
- **Middleware**: `dashboardAuth`
- **Query Params**: `search` (email substring search), `page`, `limit`.
- **Flow**: Returns paginated list of tenant users.

#### `DELETE /dashboard/users/:id`
- **Middleware**: `dashboardAuth`
- **Flow**: GDPR compliance deletion. Revokes all user sessions -> Deletes user `otp_tokens` -> Nullifies `userId` column in `risk_logs` to maintain anonymized telemetry -> Deletes user row from `users` table -> Logs `gdpr_user_deleted` risk log.

---

### End-User Authentication Routes (`/api/auth`)

*All routes under `/api/auth` require `tenantContext` middleware (Bearer Secret Key).*

#### `POST /api/auth/register`
- **Body**: `{ email: string, password: string (min 8) }`
- **Flow**: Evaluates password against HIBP -> Checks user duplicate within tenant RLS context -> Hashes password with Argon2id -> Inserts user (`isVerified: false`) -> Generates 6-digit OTP -> Sends verification email.

#### `POST /api/auth/verify-email`
- **Body**: `{ email: string, otp: string (6 digits) }`
- **Flow**: Validates OTP token hash in `otp_tokens` -> Updates `users.isVerified = true` -> Marks token `usedAt = NOW()`.

#### `POST /api/auth/login`
- **Middleware**: `credentialStuffingGuard`
- **Body**: `{ email: string, password: string, fingerprint?: string }`
- **Flow**:
  1. Validates user credentials and verification status.
  2. Resolves IP location via `geoip-lite`.
  3. Calculates Geo Velocity & checks Impossible Travel (> 900 km/h).
  4. Records/verifies device fingerprint in `device_fingerprints`.
  5. Records login attempt in Redis sliding window for velocity anomaly (> 3 IPs in 5m).
  6. Compiles 10-dimensional `LoginFeatureVector`.
  7. Queries AI Risk Engine -> Obtains `riskScore`.
  8. Evaluates MFA Condition: `user.mfaEnabled || (user.mfaEnabled && riskScore >= tenant.settings.riskThreshold)`.
  9. **Branch A: Step-up MFA Required**:
     - Generates 32-byte hex `sessionChallenge`.
     - Stores SHA-256 hash in `otp_tokens` (`type: "mfa_challenge"`, 5m TTL).
     - Logs `mfa_triggered` to `risk_logs`.
     - Returns `{ mfaRequired: true, sessionChallenge, userId }`.
  10. **Branch B: Authentication Successful**:
     - Signs RS256 Access Token with tenant's private key.
     - Inserts session into `sessions` table.
     - Signs HS256 Refresh Token containing `sessionId`.
     - Sets HttpOnly cookie `sentinel_refresh`.
     - Updates user `lastLoginAt`, `lastLoginIp`, `lastLoginLat/Lng`, and updates `loginHourProfile` histogram.
     - Clears velocity flags in Redis.
     - Returns `{ accessToken, mfaRequired: false, userId }`.

#### `POST /api/auth/mfa/verify`
- **Body**: `{ sessionChallenge: string (64 hex), code: string (6 digits TOTP), fingerprint?: string }`
- **Flow**: Validates `sessionChallenge` hash in `otp_tokens` -> Decrypts user's `mfaSecret` (AES-256-OCB) -> Verifies TOTP code via `otplib` -> Marks challenge used -> Updates user login metadata & `loginHourProfile` histogram -> Issues RS256 Access Token & HS256 Refresh Token (cookie) -> Creates `sessions` entry -> Logs `mfa_success` to `risk_logs`.

#### `POST /api/auth/mfa/setup`
- **Middleware**: `userAuth`
- **Flow**: Verifies MFA is not already enabled -> Generates 32-character Base32 secret via `otplib` -> Generates OTP URI -> Encrypts secret via AES-256-OCB and stores in `users.mfaSecret` -> Generates QR Code Data URI via `qrcode` -> Returns `{ secret, qrCodeDataUri }`.

#### `POST /api/auth/mfa/enable`
- **Middleware**: `userAuth`
- **Body**: `{ code: string (6 digits) }`
- **Flow**: Decrypts `users.mfaSecret` -> Verifies TOTP code -> Updates `users.mfaEnabled = true` -> Logs `mfa_enabled`.

#### `POST /api/auth/mfa/disable`
- **Middleware**: `userAuth`
- **Body**: `{ password: string, code: string }`
- **Flow**: Verifies user password -> Verifies TOTP code -> Sets `users.mfaEnabled = false` and `users.mfaSecret = null` -> Logs `mfa_disabled`.

#### `POST /api/auth/refresh`
- **Flow**: Reads `sentinel_refresh` cookie -> Verifies HS256 Refresh Token signature -> Checks `sessions` table for active/unrevoked session -> Issues new RS256 Access Token and rotated HS256 Refresh Token -> Updates session `tokenHash` and `expiresAt` in DB -> Updates cookie.

#### `POST /api/auth/logout`
- **Middleware**: `userAuth`
- **Flow**: Hashes current `X-User-Token` -> Marks session `isRevoked = true` in `sessions` table -> Deletes `sentinel_refresh` cookie.

---

## 9. Error Handling Architecture (`src/utils/error.ts` & `response.ts`)

### Exception Hierarchy (`AppError`)

```
AppError (statusCode: 500, code: "INTERNAL_ERROR")
 ├── ValidationError (400, "VALIDATION_ERROR")
 ├── AuthenticationError (401, "AUTHENTICATION_ERROR")
 ├── ForbiddenError (403, "FORBIDDEN")
 ├── NotFoundError (404, "NOT_FOUND")
 ├── ConflictError (409, "CONFLICT")
 └── RateLimitError (429, "RATE_LIMITED") [property: retryAfter]
```

### Error Response Envelope Format:
```json
{
  "success": false,
  "error": {
    "message": "Invalid email or password.",
    "code": "AUTHENTICATION_ERROR"
  },
  "timestamp": "2026-08-19T15:00:00.000Z"
}
```

### Success Response Envelope Format:
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-08-19T15:00:00.000Z"
}
```

### Unhandled & PostgreSQL Errors:
- PostgreSQL duplicate constraint error code `23505` is caught by `errorHandler` and mapped to `409 Conflict`.
- Unhandled JavaScript exceptions are logged to stderr and return `500 Internal Server Error` without leaking stack traces.

---

## 10. Data Types & Shared Contracts (`@sentinelauth/types`)

The API shares exact TypeScript response interfaces with the SDK and Dashboard packages via `packages/types/src/index.ts`:

```typescript
export interface AuthResponse {
  accessToken: string;
  mfaRequired: boolean;
  riskScore?: number;
}

export interface TenantRegistrationResponse {
  tenantId: string;
  publicKey: string;
  secretKey: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
  };
  timestamp: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

export interface LoginSuccessResponse {
  accessToken: string;
  mfaRequired: false;
  userId: string;
}

export interface LoginMfaResponse {
  mfaRequired: true;
  sessionChallenge: string;
  userId: string;
}

export type LoginResponse = LoginSuccessResponse | LoginMfaResponse;

export interface AuditLogEntry {
  id: string;
  eventType: string;
  riskScore: number | null;
  mfaTriggered: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  fingerprint: string | null;
  geoLat: string | null;
  geoLng: string | null;
  features: Record<string, number> | null;
  userEmail: string | null;
  createdAt: string;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```
