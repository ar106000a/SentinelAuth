import { Context, Next } from "hono";
import { isIpBlocked, getBlockTimeRemaining } from "../lib/credential-stuffing.js";
import { RateLimitError } from "../utils/error";
import { env } from "../config/env.js";
import { clientIp } from "../lib/client-ip.js";

export async function credentialStuffingGuard(c: Context, next: Next) {
  if (env.NODE_ENV === "test") {
    await next();
    return;
  }

  const ip = clientIp(c);

  // Unknown IP — cannot block, let through
  if (ip === null) {
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