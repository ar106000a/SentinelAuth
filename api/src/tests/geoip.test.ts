import { describe, it, expect } from "vitest";
import { lookupIp } from "../lib/geoip.js";

describe("GeoIP lookup", () => {
  it("returns null for 'unknown' placeholder", () => {
    expect(lookupIp("unknown")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(lookupIp("")).toBeNull();
  });

  it("returns null for localhost", () => {
    expect(lookupIp("127.0.0.1")).toBeNull();
  });

  it("resolves a known public IP to coordinates", () => {
    // Google DNS — well-known, stable, geolocates to US
    const result = lookupIp("8.8.8.8");
    expect(result).not.toBeNull();
    expect(typeof result?.lat).toBe("number");
    expect(typeof result?.lng).toBe("number");
    expect(result?.country).toBe("US");
  });

  it("extracts first IP from x-forwarded-for chain", () => {
    const result = lookupIp("8.8.8.8, 10.0.0.1, 10.0.0.2");
    expect(result).not.toBeNull();
    expect(result?.country).toBe("US");
  });

  it("handles IP with surrounding whitespace in chain", () => {
    const result = lookupIp("8.8.8.8 , 10.0.0.1");
    expect(result).not.toBeNull();
  });

  it("returns valid lat/lng ranges", () => {
    const result = lookupIp("8.8.8.8");
    expect(result?.lat).toBeGreaterThanOrEqual(-90);
    expect(result?.lat).toBeLessThanOrEqual(90);
    expect(result?.lng).toBeGreaterThanOrEqual(-180);
    expect(result?.lng).toBeLessThanOrEqual(180);
  });
});
