import FingerprintJS from "@fingerprintjs/fingerprintjs";

let cachedFingerprint: string | null = null;
let cachedPromise: Promise<string> | null = null;

/**
 * Collects a device fingerprint using FingerprintJS.
 *
 * This is a probabilistic identifier, not a guaranteed unique ID —
 * it combines browser/hardware signals (canvas rendering, fonts,
 * screen properties, etc.) into a hash that is statistically likely
 * to be stable for a given browser+device combination, but will
 * change if the user switches browsers or significantly updates
 * their environment.
 *
 * The result is cached in-memory for the lifetime of the page load —
 * fingerprint generation involves rendering canvas/audio tests and
 * is not free to repeat on every call.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (cachedFingerprint) {
    return cachedFingerprint;
  }

  // If a collection is already in flight, reuse that promise
  // rather than triggering FingerprintJS twice concurrently
  if (cachedPromise) {
    return cachedPromise;
  }

  cachedPromise = (async () => {
    try {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      cachedFingerprint = result.visitorId;
      return cachedFingerprint;
    } catch (err) {
      // Fingerprinting can fail in restrictive environments
      // (some privacy browsers, certain iframe sandboxes).
      // This must never block login — return null upstream instead.
      cachedPromise = null;
      throw err;
    }
  })();

  return cachedPromise;
}

/**
 * Attempts to get a device fingerprint, returning null on any failure
 * rather than throwing. Login must never be blocked by fingerprinting
 * failing — it is a risk-scoring input, not a required credential.
 */
export async function tryGetDeviceFingerprint(): Promise<string | null> {
  try {
    return await getDeviceFingerprint();
  } catch {
    return null;
  }
}

/** Clears the cached fingerprint — primarily useful for testing. */
export function clearFingerprintCache(): void {
  cachedFingerprint = null;
  cachedPromise = null;
}
