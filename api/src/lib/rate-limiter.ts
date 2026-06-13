import { redis } from "./redis";

export interface RateLimitConfig {
  maxTokens: number; // bucket capacity
  refillRate: number; // tokens added per second
  windowSeconds: number; // TTL for the Redis key
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxTokens: 100,
  refillRate: 10,
  windowSeconds: 60,
};

export const AUTH_RATE_LIMIT: RateLimitConfig = {
  maxTokens: 20,
  refillRate: 2,
  windowSeconds: 60,
};

export async function consumeToken(
  key: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): Promise<RateLimitResult> {
  const now = Date.now() / 1000; // current time in seconds
  const bucketKey = `ratelimit:${key}`;

  // Lua script runs atomically in Redis — no race conditions
  const luaScript = `
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local max_tokens = tonumber(ARGV[2])
    local refill_rate = tonumber(ARGV[3])
    local window = tonumber(ARGV[4])

    -- Get current bucket state
    local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
    local tokens = tonumber(bucket[1])
    local last_refill = tonumber(bucket[2])

    -- Initialize bucket if it doesn't exist
    if tokens == nil then
      tokens = max_tokens
      last_refill = now
    end

    -- Calculate tokens to add based on time elapsed
    local elapsed = now - last_refill
    local refill_amount = elapsed * refill_rate
    tokens = math.min(max_tokens, tokens + refill_amount)
    last_refill = now

    -- Try to consume one token
    local allowed = 0
    if tokens >= 1 then
      tokens = tokens - 1
      allowed = 1
    end

    -- Persist updated bucket state
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
    redis.call('EXPIRE', key, window)

    local reset_in = math.ceil((1 - tokens) / refill_rate)
    if reset_in < 0 then reset_in = 0 end

    return { allowed, math.floor(tokens), reset_in }
  `;

  const result = (await redis.eval(
    luaScript,
    1,
    bucketKey,
    now.toString(),
    config.maxTokens.toString(),
    config.refillRate.toString(),
    config.windowSeconds.toString()
  )) as [number, number, number];

  return {
    allowed: result[0] === 1,
    remaining: result[1],
    resetInSeconds: result[2],
  };
}
