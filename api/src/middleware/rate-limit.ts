import { Context, Next } from 'hono';
import { clientIp } from '../lib/client-ip';
import {
  limit,
  ipLayer,
  tenantLayer,
  RateLimitConfig,
  isRateLimitDisabled,
} from '../lib/rate-limiter';

/** Write the standard rate-limit response headers. */
function setHeaders(
  c: Context,
  config: RateLimitConfig,
  remaining: number,
  resetInSeconds: number
): void {
  c.header('X-RateLimit-Limit', config.maxTokens.toString());
  c.header('X-RateLimit-Remaining', Math.max(0, remaining).toString());
  c.header('X-RateLimit-Reset', resetInSeconds.toString());
}

// ─── Layer 3: IP (pre-auth) ───────────────────────────────────────────────────

/**
 * IP-level rate limiter.  Runs BEFORE tenantContext.
 *
 * - Derives the client IP via clientIp() (honours TRUSTED_PROXY_HOPS).
 * - If IP is null: logs a structured warning and calls next() without blocking.
 *   We cannot limit what we cannot identify, but we do not silently succeed.
 * - On denial: returns 429 with Retry-After header.
 */
export function preAuthRateLimit(config: RateLimitConfig) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    if (isRateLimitDisabled()) {
      c.header('X-RateLimit-Limit', 'Not implied');
      c.header('X-RateLimit-Remaining', 'Not implied');
      c.header('X-RateLimit-Reset', 'Not implied');
      await next();
      return;
    }

    const ip = clientIp(c);

    if (ip === null) {
      // Log a structured signal — no enumerable IP means we cannot bucket this
      // request at the IP layer.  A real deployment should never reach here if
      // TRUSTED_PROXY_HOPS is configured correctly.
      console.warn(
        JSON.stringify({
          signal: 'null_client_ip',
          path: c.req.path,
          method: c.req.method,
          requestId: c.get('requestId') ?? null,
        })
      );
      await next();
      return;
    }

    const layer = ipLayer(config, ip);
    const result = await limit([layer]);

    setHeaders(c, config, result.remaining, result.resetInSeconds);

    if (!result.allowed) {
      c.header('Retry-After', result.resetInSeconds.toString());
      return c.json(
        { error: 'Too many requests', retryAfter: result.resetInSeconds },
        429
      );
    }

    await next();
  };
}

// ─── Layer 2: Tenant (post-auth) ─────────────────────────────────────────────

/**
 * Tenant-level rate limiter.  Runs AFTER tenantContext has populated
 * c.get("tenantId").
 *
 * Throws a 500-class programmer error if called before tenantContext — this
 * prevents silent mis-ordering of middleware.
 */
export function tenantRateLimit(config: RateLimitConfig) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    if (isRateLimitDisabled()) {
      await next();
      return;
    }

    const tenantId = c.get('tenantId') as string | undefined;
    if (!tenantId) {
      throw new Error(
        'tenantRateLimit: tenantId is not set. ' +
          'Ensure tenantContext middleware runs before tenantRateLimit.'
      );
    }

    const layer = tenantLayer(config, tenantId);
    const result = await limit([layer]);

    setHeaders(c, config, result.remaining, result.resetInSeconds);

    if (!result.allowed) {
      c.header('Retry-After', result.resetInSeconds.toString());
      return c.json(
        { error: 'Too many requests', retryAfter: result.resetInSeconds },
        429
      );
    }

    await next();
  };
}
