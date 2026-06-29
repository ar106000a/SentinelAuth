import { Context, Next } from "hono";
import { isIpBlocked, getBlockTimeRemaining } from "../lib/credential-stuffing.js";
import { RateLimitError } from "../utils/error";
import { env } from "../config/env.js";

export async function credentialStuffingGuard(c: Context, next: Next) {
  if (env.NODE_ENV === "test") {
    await next();
    return;
  }

  const ip =
    c.req.header("x-forwarded-for") ??
    c.req.header("x-real-ip") ??
    "unknown";

  // Unknown IP — can't block, let through
  if (ip === "unknown") {
    await next();
    return;
  }

  const blocked = await isIpBlocked(ip);

  if (blocked) {
    const retryAfter = await getBlockTimeRemaining(ip);
    c.header("Retry-After", retryAfter.toString());
    throw new RateLimitError(retryAfter);
  }

  await next();
}