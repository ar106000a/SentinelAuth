import { describe, it, expect } from "vitest";
import {
  haversineDistanceKm,
  computeGeoVelocity,
  isImpossibleTravel,
} from "../lib/geo-velocity.js";

describe("Haversine distance", () => {
  it("returns 0 for identical coordinates", () => {
    const dist = haversineDistanceKm(33.6844, 73.0479, 33.6844, 73.0479);
    expect(dist).toBeCloseTo(0, 5);
  });

  it("computes known distance — Islamabad to London", () => {
    // Islamabad: 33.6844, 73.0479
    // London: 51.5074, -0.1278
    // Known distance: ~6,000 km
    const dist = haversineDistanceKm(33.6844, 73.0479, 51.5074, -0.1278);
    expect(dist).toBeGreaterThan(5800);
    expect(dist).toBeLessThan(6200);
  });

  it("computes known distance — New York to London", () => {
    // New York: 40.7128, -74.006
    // London: 51.5074, -0.1278
    // Known distance: ~5,570 km
    const dist = haversineDistanceKm(40.7128, -74.006, 51.5074, -0.1278);
    expect(dist).toBeGreaterThan(5400);
    expect(dist).toBeLessThan(5700);
  });

  it("handles antipodal points — maximum distance", () => {
    // North Pole to South Pole ≈ half of Earth's circumference ≈ 20,015 km
    const dist = haversineDistanceKm(90, 0, -90, 0);
    expect(dist).toBeGreaterThan(19000);
    expect(dist).toBeLessThan(21000);
  });
});

describe("Geo-velocity computation", () => {
  it("returns 0 when previous location is null", () => {
    const velocity = computeGeoVelocity(
      null,
      null,
      new Date(Date.now() - 3600 * 1000),
      51.5074,
      -0.1278
    );
    expect(velocity).toBe(0.0);
  });

  it("returns 0 when current location is null", () => {
    const velocity = computeGeoVelocity(
      33.6844,
      73.0479,
      new Date(Date.now() - 3600 * 1000),
      null,
      null
    );
    expect(velocity).toBe(0.0);
  });

  it("returns 0 when previousLoginAt is null", () => {
    const velocity = computeGeoVelocity(
      33.6844,
      73.0479,
      null,
      51.5074,
      -0.1278
    );
    expect(velocity).toBe(0.0);
  });

  it("returns 0 for same location regardless of time elapsed", () => {
    const velocity = computeGeoVelocity(
      33.6844,
      73.0479,
      new Date(Date.now() - 3600 * 1000),
      33.6844,
      73.0479
    );
    expect(velocity).toBeCloseTo(0, 1);
  });

  it("computes realistic velocity for Islamabad to London in 1 hour", () => {
    // ~6000 km in 1 hour = ~6000 km/h (definitely impossible travel)
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const velocity = computeGeoVelocity(
      33.6844,
      73.0479,
      oneHourAgo,
      51.5074,
      -0.1278
    );
    expect(velocity).toBeGreaterThan(5800);
    expect(velocity).toBeLessThan(6200);
  });

  it("computes realistic velocity for same city in 1 hour", () => {
    // ~5 km in 1 hour = ~5 km/h (walking pace — legitimate)
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const velocity = computeGeoVelocity(
      33.6844,
      73.0479,
      oneHourAgo,
      33.69,
      73.05 // nearby in Islamabad
    );
    expect(velocity).toBeLessThan(20);
  });

  it("returns 0 for logins within 1 second — clock skew guard", () => {
    const justNow = new Date(Date.now() - 500); // 500ms ago
    const velocity = computeGeoVelocity(
      33.6844,
      73.0479,
      justNow,
      51.5074,
      -0.1278
    );
    expect(velocity).toBe(0.0);
  });

  it("handles very old previous login gracefully", () => {
    // 30 days ago — velocity will be tiny even for large distance
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const velocity = computeGeoVelocity(
      33.6844,
      73.0479,
      thirtyDaysAgo,
      51.5074,
      -0.1278
    );
    expect(velocity).toBeGreaterThan(0);
    expect(velocity).toBeLessThan(10); // ~6000km / 720h ≈ 8.3 km/h
  });
});

describe("Impossible travel detection", () => {
  it("flags velocity above 900 km/h", () => {
    expect(isImpossibleTravel(901)).toBe(true);
    expect(isImpossibleTravel(6000)).toBe(true);
  });

  it("does not flag velocity at or below 900 km/h", () => {
    expect(isImpossibleTravel(900)).toBe(false);
    expect(isImpossibleTravel(500)).toBe(false);
    expect(isImpossibleTravel(0)).toBe(false);
  });

  it("flags realistic intercontinental impossible travel", () => {
    // Islamabad to London in 1 hour ≈ 6000 km/h
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const velocity = computeGeoVelocity(
      33.6844,
      73.0479,
      oneHourAgo,
      51.5074,
      -0.1278
    );
    expect(isImpossibleTravel(velocity)).toBe(true);
  });

  it("does not flag realistic same-city login", () => {
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const velocity = computeGeoVelocity(
      33.6844,
      73.0479,
      oneHourAgo,
      33.69,
      73.05
    );
    expect(isImpossibleTravel(velocity)).toBe(false);
  });
});
