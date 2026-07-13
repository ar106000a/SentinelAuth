const EARTH_RADIUS_KM = 6371;
const IMPOSSIBLE_TRAVEL_THRESHOLD_KMH = 900; // commercial jet speed

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

export function computeGeoVelocity(
  previousLat: number | null,
  previousLng: number | null,
  previousLoginAt: Date | null,
  currentLat: number | null,
  currentLng: number | null
): number {
  // Can't compute without both locations
  if (
    previousLat === null ||
    previousLng === null ||
    currentLat === null ||
    currentLng === null ||
    previousLoginAt === null
  ) {
    return 0.0;
  }

  const distanceKm = haversineDistanceKm(
    previousLat,
    previousLng,
    currentLat,
    currentLng
  );

  // Time elapsed in hours
  const elapsedMs = Date.now() - previousLoginAt.getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  // Avoid division by zero — if logins are within 1 second, treat as same session
  if (elapsedHours < 1 / 3600) {
    return 0.0;
  }

  return distanceKm / elapsedHours;
}

export function isImpossibleTravel(velocityKmh: number): boolean {
  return velocityKmh > IMPOSSIBLE_TRAVEL_THRESHOLD_KMH;
}
