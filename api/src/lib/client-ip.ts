import { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { env } from '../config/env';

/**
 * Return the validated client IP address.
 *
 * TRUSTED_PROXY_HOPS controls how many reverse-proxy hops sit in front of
 * this server:
 *
 *  - 0 (default / local dev):
 *      Ignore every forwarding header — they are all client-controlled.
 *      Return the raw socket address from getConnInfo().
 *      Return null if the runtime cannot provide one.
 *
 *  - N > 0 (deployed behind N known proxies):
 *      Read X-Forwarded-For, split on commas, trim, drop empty segments.
 *      Return chain[chain.length - N]  (the Nth entry from the right).
 *      Return null when the header is absent or the chain is too short.
 *      Never fall back to any other header.
 *
 * Never reads x-real-ip. Never substitutes "unknown".
 */
export function clientIp(c: Context): string | null {
  const hops =
    process.env.TRUSTED_PROXY_HOPS !== undefined
      ? Number(process.env.TRUSTED_PROXY_HOPS)
      : (env.TRUSTED_PROXY_HOPS ?? 0);

  if (hops <= 0) {
    try {
      const conn = getConnInfo(c);
      const addr = conn?.remote?.address;
      return addr ?? null;
    } catch {
      return null;
    }
  }

  const raw = c.req.header('x-forwarded-for');
  if (!raw) {
    return null;
  }

  const chain = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const idx = chain.length - hops;
  if (idx < 0) {
    return null;
  }

  return chain[idx];
}
