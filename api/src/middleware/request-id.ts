import { Context, Next } from "hono";
import { randomUUID } from "crypto";

export async function requestId(c: Context, next: Next) {
  const id = c.req.header("X-Request-ID") ?? randomUUID();
  c.set("requestId", id);
  c.header("X-Request-ID", id);
  await next();
}
