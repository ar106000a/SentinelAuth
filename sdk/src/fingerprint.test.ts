import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock FingerprintJS before importing our module
vi.mock("@fingerprintjs/fingerprintjs", () => ({
  default: {
    load: vi.fn(),
  },
}));

import FingerprintJS from "@fingerprintjs/fingerprintjs";
import {
  getDeviceFingerprint,
  tryGetDeviceFingerprint,
  clearFingerprintCache,
} from "./fingerprint.js";

describe("getDeviceFingerprint", () => {
  beforeEach(() => {
    clearFingerprintCache();
    vi.clearAllMocks();
  });

  it("returns the visitorId from FingerprintJS", async () => {
    const mockGet = vi.fn().mockResolvedValue({ visitorId: "abc123hash" });
    (FingerprintJS.load as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: mockGet,
    });

    const result = await getDeviceFingerprint();
    expect(result).toBe("abc123hash");
  });

  it("caches the result — second call does not re-invoke FingerprintJS", async () => {
    const mockGet = vi.fn().mockResolvedValue({ visitorId: "abc123hash" });
    (FingerprintJS.load as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: mockGet,
    });

    await getDeviceFingerprint();
    await getDeviceFingerprint();

    expect(FingerprintJS.load).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent calls into a single collection", async () => {
    let resolveGet: (v: { visitorId: string }) => void;
    const getPromise = new Promise<{ visitorId: string }>((resolve) => {
      resolveGet = resolve;
    });

    const mockGet = vi.fn().mockReturnValue(getPromise);
    (FingerprintJS.load as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: mockGet,
    });

    // Fire two calls before the first resolves
    const call1 = getDeviceFingerprint();
    const call2 = getDeviceFingerprint();

    resolveGet!({ visitorId: "concurrent-result" });

    const [result1, result2] = await Promise.all([call1, call2]);

    expect(result1).toBe("concurrent-result");
    expect(result2).toBe("concurrent-result");
    // Only one actual FingerprintJS.load() call despite two concurrent requests
    expect(FingerprintJS.load).toHaveBeenCalledTimes(1);
  });

  it("throws when FingerprintJS fails", async () => {
    (FingerprintJS.load as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Canvas access blocked")
    );

    await expect(getDeviceFingerprint()).rejects.toThrow(
      "Canvas access blocked"
    );
  });

  it("allows retry after a failure — does not cache the rejection", async () => {
    (FingerprintJS.load as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockResolvedValueOnce({
        get: vi.fn().mockResolvedValue({ visitorId: "recovered-hash" }),
      });

    await expect(getDeviceFingerprint()).rejects.toThrow();

    const result = await getDeviceFingerprint();
    expect(result).toBe("recovered-hash");
  });
});

describe("tryGetDeviceFingerprint", () => {
  beforeEach(() => {
    clearFingerprintCache();
    vi.clearAllMocks();
  });

  it("returns the fingerprint on success", async () => {
    (FingerprintJS.load as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: vi.fn().mockResolvedValue({ visitorId: "hash123" }),
    });

    const result = await tryGetDeviceFingerprint();
    expect(result).toBe("hash123");
  });

  it("returns null instead of throwing on failure", async () => {
    (FingerprintJS.load as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Blocked by privacy extension")
    );

    const result = await tryGetDeviceFingerprint();
    expect(result).toBeNull();
  });
});
