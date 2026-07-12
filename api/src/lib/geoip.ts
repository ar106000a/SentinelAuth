import geoip from "geoip-lite";
export interface GeoLocation {
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
}

export function lookupIp(ip: string): GeoLocation | null {
  // Private/local IPs and "unknown" placeholder won't resolve — expected
  if (!ip || ip === "unknown") {
    return null;
  }

  // x-forwarded-for can be a comma-separated chain — take the first (client) IP
  const cleanIp = ip.split(",")[0].trim();

  const result = geoip.lookup(cleanIp);

  if (!result) {
    return null;
  }

  return {
    lat: result.ll[0],
    lng: result.ll[1],
    city: result.city || null,
    country: result.country || null,
  };
}
