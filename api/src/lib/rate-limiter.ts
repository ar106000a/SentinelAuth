import { redis } from './redis';
import { env } from '../config/env';

/** Whether rate limiting is disabled (e.g. in test environments by default). */
export function isRateLimitDisabled(): boolean {
  if (process.env.RATE_LIMIT_DISABLED !== undefined) {
    return process.env.RATE_LIMIT_DISABLED === 'true';
  }
  return env.NODE_ENV === 'test';
}

// ─── Config ──────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Human-readable name; becomes part of the Redis key so different configs never share buckets. */
  name: string;
  /** Bucket capacity (maximum tokens). */
  maxTokens: number;
  /** Tokens added per second (continuous refill). Must be > 0. */
  refillRate: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  name: 'default',
  maxTokens: 100,
  refillRate: 10, // refills fully in 10 s
};

export const AUTH_RATE_LIMIT: RateLimitConfig = {
  name: 'auth',
  maxTokens: 40,
  refillRate: 2, // refills fully in 20 s
};

export const MAINT_RATE_LIMIT: RateLimitConfig = {
  name: 'maint',
  maxTokens: 200,
  refillRate: 15,
};

// ─── Layer / Result types ─────────────────────────────────────────────────────

/**
 * One rate-limit bucket that must have a token available for a request to
 * pass. Typically built as:
 *   { key: `ratelimit:<kind>:<limiterName>:<identity>`, cap: ..., refill: ... }
 */
export interface Layer {
  key: string;
  cap: number;
  refill: number;
}

export interface LimitResult {
  allowed: boolean;
  /** Index of the first layer that denied the request (0-based), or null when allowed. */
  failedIndex: number | null;
  /** Lowest remaining token count across all layers (floor 0). */
  remaining: number;
  /** Seconds until a token is available in the failed layer (0 when allowed). */
  resetInSeconds: number;
}

// ─── Lua script ───────────────────────────────────────────────────────────────
//
// KEYS[i]  = full bucket key for layer i (1-indexed in Lua)
// ARGV[1]  = now (Unix seconds, float)
// ARGV[2+] = cap1, refill1, cap2, refill2, ...  (pairs, one per layer)
//
// Pass 1 (read-only): For each key compute the current refilled token count.
//   - A missing bucket starts full (cap tokens).
//   - If any bucket has tokens < 1, immediately return:
//       { 0, layerIndex-1, floor(remaining), resetSeconds }
//     without writing anything.
//
// Pass 2 (write): Every layer passed → deduct 1 token from each bucket,
//   persist updated state, and set a per-key TTL = max(60, ceil(cap/refill)).
//
// Returns an array: { allowed(0|1), failedIndex(0=none), remaining, resetSecs }

const LUA_SCRIPT = `
local n      = #KEYS
local now    = tonumber(ARGV[1])

-- Pass 1: compute refilled token counts, detect first denial
local counts = {}
for i = 1, n do
  local cap    = tonumber(ARGV[1 + (i-1)*2 + 1])
  local refill = tonumber(ARGV[1 + (i-1)*2 + 2])

  local raw        = redis.call('HMGET', KEYS[i], 'tokens', 'last_refill')
  local tokens     = tonumber(raw[1])
  local last_refill = tonumber(raw[2])

  if tokens == nil then
    -- Brand-new bucket — start full
    tokens      = cap
    last_refill = now
  else
    local elapsed = now - last_refill
    if elapsed < 0 then elapsed = 0 end
    tokens = math.min(cap, tokens + elapsed * refill)
    last_refill = now
  end

  counts[i] = { tokens = tokens, cap = cap, refill = refill, last_refill = last_refill }

  if tokens < 1 then
    local reset = math.ceil((1 - tokens) / refill)
    if reset < 0 then reset = 0 end
    return { 0, i - 1, math.floor(tokens), reset }
  end
end

-- Pass 2: all layers have a token — deduct and persist
local min_remaining = math.huge
for i = 1, n do
  local c        = counts[i]
  local new_tok  = c.tokens - 1
  local ttl      = math.ceil(c.cap / c.refill)
  if ttl < 60 then ttl = 60 end

  redis.call('HMSET', KEYS[i], 'tokens', new_tok, 'last_refill', c.last_refill)
  redis.call('EXPIRE', KEYS[i], ttl)

  if new_tok < min_remaining then
    min_remaining = new_tok
  end
end

if min_remaining == math.huge then min_remaining = 0 end
return { 1, 0, math.floor(min_remaining), 0 }
`;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Atomically check and consume one token from every layer.
 *
 * All-or-nothing: if any layer would be denied, NO bucket is written.
 * Layers are evaluated left-to-right; the first denial is reported.
 *
 * @throws if any layer has refill <= 0 (programmer error).
 */
export async function limit(layers: Layer[]): Promise<LimitResult> {
  if (layers.length === 0) {
    return { allowed: true, failedIndex: null, remaining: Infinity, resetInSeconds: 0 };
  }

  for (const layer of layers) {
    if (layer.refill <= 0) {
      throw new Error(
        `Rate-limit layer "${layer.key}" has refill=${layer.refill}; must be > 0`
      );
    }
  }

  const keys = layers.map((l) => l.key);
  const now = Date.now() / 1000;

  // ARGV layout: [now, cap1, refill1, cap2, refill2, ...]
  const argv: string[] = [now.toString()];
  for (const layer of layers) {
    argv.push(layer.cap.toString(), layer.refill.toString());
  }

  const raw = (await redis.eval(
    LUA_SCRIPT,
    keys.length,
    ...keys,
    ...argv
  )) as [number, number, number, number];

  const [allowed, failedIdx, remaining, resetInSeconds] = raw;

  return {
    allowed: allowed === 1,
    failedIndex: allowed === 1 ? null : failedIdx,
    remaining: Math.max(0, remaining),
    resetInSeconds,
  };
}

// ─── Key builders (helpers for middleware / handlers) ─────────────────────────

/** Layer 3 — IP-level pre-auth bucket. */
export function ipLayer(config: RateLimitConfig, ip: string): Layer {
  return {
    key: `ratelimit:ip:${config.name}:${ip}`,
    cap: config.maxTokens,
    refill: config.refillRate,
  };
}

/** Layer 2 — Tenant-level post-auth bucket. */
export function tenantLayer(config: RateLimitConfig, tenantId: string): Layer {
  return {
    key: `ratelimit:tenant:${config.name}:${tenantId}`,
    cap: config.maxTokens,
    refill: config.refillRate,
  };
}

/**
 * Layer 1 — Per-email OTP-generation bucket.
 * @param prefix  e.g. "otp-gen-min", "otp-gen-hour", "otp-gen-day"
 * @param scope   tenantId on /api/* routes; literal "tenant-admin" on /tenants/* routes
 * @param email   Already normalized (trim + toLowerCase)
 */
export function otpLayer(
  prefix: string,
  scope: string,
  email: string,
  cap: number,
  refill: number
): Layer {
  return {
    key: `ratelimit:${prefix}:${scope}:${email}`,
    cap,
    refill,
  };
}
