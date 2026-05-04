import { Context, Next } from "hono";
import {
  consumeToken,
  RateLimitConfig,
  AUTH_RATE_LIMIT,
} from "../lib/rate-limiter";

export function rateLimitMiddleware(config: RateLimitConfig = AUTH_RATE_LIMIT) {
  return async (c: Context, next: Next) => {
    // Key by tenant API key + IP for per-tenant-per-IP limiting
    const apiKey =
      c.req.header("Authorization")?.replace("Bearer ", "") ?? "anonymous";
    const ip =
      c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";

    const key = `${apiKey}:${ip}`;
    const result = await consumeToken(key, config);

    // Always set rate limit headers so clients know their status
    c.header("X-RateLimit-Limit", config.maxTokens.toString());
    c.header("X-RateLimit-Remaining", result.remaining.toString());
    c.header("X-RateLimit-Reset", result.resetInSeconds.toString());

    if (!result.allowed) {
      return c.json(
        {
          error: "Too many requests",
          retryAfter: result.resetInSeconds,
        },
        429
      );
    }

    await next();
  };
}
