import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono, Context } from "hono";
import { clientIp } from "../lib/client-ip";

describe("clientIp", () => {
  const originalEnvHops = process.env.TRUSTED_PROXY_HOPS;

  afterEach(() => {
    if (originalEnvHops !== undefined) {
      process.env.TRUSTED_PROXY_HOPS = originalEnvHops;
    } else {
      delete process.env.TRUSTED_PROXY_HOPS;
    }
  });

  function makeContext(headers: Record<string, string>): Context {
    const app = new Hono();
    let ctx!: Context;
    app.all("*", (c) => {
      ctx = c;
      return c.text("ok");
    });
    const reqHeaders = new Headers();
    for (const [k, v] of Object.entries(headers)) {
      reqHeaders.set(k, v);
    }
    app.fetch(new Request("http://localhost/test", { headers: reqHeaders }));
    return ctx;
  }

  it("HOPS=0 ignores a forged XFF and returns null when socket info is unavailable", () => {
    process.env.TRUSTED_PROXY_HOPS = "0";
    const ctx = makeContext({
      "x-forwarded-for": "203.0.113.195",
      "x-real-ip": "198.51.100.1",
    });
    // In in-process tests with no raw socket, getConnInfo cannot provide an address -> null
    expect(clientIp(ctx)).toBeNull();
  });

  it("HOPS=1 with '1.1.1.1, 203.0.113.7' returns 203.0.113.7", () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    const ctx = makeContext({
      "x-forwarded-for": "1.1.1.1, 203.0.113.7",
    });
    expect(clientIp(ctx)).toBe("203.0.113.7");
  });

  it("HOPS=2 returns the second from the right", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    const ctx = makeContext({
      "x-forwarded-for": "1.1.1.1, 203.0.113.7, 10.0.0.1",
    });
    expect(clientIp(ctx)).toBe("203.0.113.7");
  });

  it("returns null when x-forwarded-for header is missing (HOPS > 0)", () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    const ctx = makeContext({});
    expect(clientIp(ctx)).toBeNull();
  });

  it("returns null when chain is too short for the configured HOPS", () => {
    process.env.TRUSTED_PROXY_HOPS = "3";
    const ctx = makeContext({
      "x-forwarded-for": "1.1.1.1, 203.0.113.7",
    });
    expect(clientIp(ctx)).toBeNull();
  });

  it("ignores whitespace and empty segments in x-forwarded-for", () => {
    process.env.TRUSTED_PROXY_HOPS = "2";
    const ctx = makeContext({
      "x-forwarded-for": "  1.1.1.1 , , 203.0.113.7 , 10.0.0.1  , ",
    });
    expect(clientIp(ctx)).toBe("203.0.113.7");
  });

  it("never reads x-real-ip even if x-forwarded-for is missing", () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    const ctx = makeContext({
      "x-real-ip": "198.51.100.22",
    });
    expect(clientIp(ctx)).toBeNull();
  });
});
