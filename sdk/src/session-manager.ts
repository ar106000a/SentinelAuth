import { RefreshResponse } from "@sentinelauth/types";
import {
  HttpClient,
  SentinelAuthError,
  StorageAdapter,
  TokenTransport,
} from "./client.js";

export const defaultStorageAdapter: StorageAdapter = {
  getItem: (key: string) => {
    try {
      return typeof localStorage !== "undefined"
        ? localStorage.getItem(key)
        : null;
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(key, value);
      }
    } catch {}
  },
  removeItem: (key: string) => {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(key);
      }
    } catch {}
  },
};

/**
 * Pure-JS synchronous SHA-256 implementation to hash apiUrl + apiKey
 * into a deterministic 16-hex-character namespace with no external dependencies.
 */
function sha256Hex16(input: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i = 0,
    j = 0;
  let result = "";

  const words: number[] = [];
  const asciiBitLength = input.length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  input += "\x80";
  while ((input.length % 64) - 56) input += "\x00";
  for (i = 0; i < input.length; i++) {
    j = input.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15],
        w2 = w[i - 2];

      const s0 =
        rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 =
        rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const maj =
        (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp1 =
        hash[7] +
        (rightRotate(hash[4], 6) ^
          rightRotate(hash[4], 11) ^
          rightRotate(hash[4], 25)) +
        ch +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] + s0 + w[i - 7] + s1) | 0);
      const temp2 =
        (rightRotate(hash[0], 2) ^
          rightRotate(hash[0], 13) ^
          rightRotate(hash[0], 22)) +
        maj;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      const byte = (hash[i] >> (b * 8)) & 255;
      result += (byte < 16 ? "0" : "") + byte.toString(16);
    }
  }

  return result.slice(0, 16);
}

export function computeStorageKey(apiUrl: string, apiKey: string): string {
  return `sentinel_rt_${sha256Hex16(`${apiUrl}:${apiKey}`)}`;
}

export class InMemoryStorage implements StorageAdapter {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

export interface SessionManagerOptions {
  apiUrl: string;
  apiKey: string;
  tokenTransport?: TokenTransport;
  storage?: StorageAdapter;
  onSessionExpired: () => void;
  onSignedOut?: () => void;
}

export class SessionManager {
  private accessToken: string | null = null;
  private lastRefreshAt = 0;
  private refreshPromise: Promise<string> | null = null;
  private storage: StorageAdapter;
  private tokenTransport: TokenTransport;
  private storageKey: string;
  private lockKey: string;
  private channelName: string;
  private broadcastChannel: BroadcastChannel | null = null;
  private onSessionExpired: () => void;
  private onSignedOut: () => void;

  readonly ready: Promise<void>;

  constructor(
    private httpClient: HttpClient,
    options: SessionManagerOptions | (() => void)
  ) {
    if (typeof options === "function") {
      // Legacy signature compatibility
      this.onSessionExpired = options;
      this.onSignedOut = () => {};
      this.tokenTransport = "cookie";
      this.storage = defaultStorageAdapter;
      this.storageKey = "sentinel_rt_default";
      this.lockKey = "sentinel_lock_default";
      this.channelName = "sentinel_channel_default";
      this.ready = Promise.resolve();
    } else {
      this.onSessionExpired = options.onSessionExpired;
      this.onSignedOut = options.onSignedOut ?? (() => {});
      this.tokenTransport = options.tokenTransport ?? "cookie";
      this.storage = options.storage ?? defaultStorageAdapter;

      const hash = sha256Hex16(`${options.apiUrl}:${options.apiKey}`);
      this.storageKey = `sentinel_rt_${hash}`;
      this.lockKey = `sentinel_lock_${hash}`;
      this.channelName = `sentinel_channel_${hash}`;

      if (this.tokenTransport === "storage") {
        this.initBroadcastChannel();
        this.ready = this.initSilentRestore();
      } else {
        this.ready = Promise.resolve();
      }
    }
  }

  private initBroadcastChannel() {
    if (typeof BroadcastChannel !== "undefined") {
      try {
        this.broadcastChannel = new BroadcastChannel(this.channelName);
        this.broadcastChannel.onmessage = (event) => {
          if (
            event.data?.type === "REFRESH_SUCCESS" &&
            typeof event.data.accessToken === "string"
          ) {
            this.accessToken = event.data.accessToken;
            this.lastRefreshAt = Date.now();
            if (event.data.refreshToken) {
              void Promise.resolve(
                this.storage.setItem(this.storageKey, event.data.refreshToken)
              );
            }
          } else if (event.data?.type === "SIGNED_OUT") {
            this.accessToken = null;
            this.lastRefreshAt = 0;
            void Promise.resolve(this.storage.removeItem(this.storageKey));
            this.onSignedOut();
          }
        };
      } catch {
        this.broadcastChannel = null;
      }
    }
  }

  /**
   * Silent restore from persisted refresh token on startup (storage mode only).
   * Does not throw; catches errors and emits session-expired / signed-out.
   */
  private async initSilentRestore(): Promise<void> {
    try {
      const storedToken = await this.storage.getItem(this.storageKey);
      if (!storedToken) {
        return;
      }
      await this.doRefreshStorage(storedToken);
    } catch {
      // doRefreshStorage already cleared storage, set accessToken to null,
      // and called onSessionExpired() / onSignedOut(). We swallow here so ready resolves.
    }
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  async setRefreshToken(token: string): Promise<void> {
    if (this.tokenTransport === "storage") {
      await this.storage.setItem(this.storageKey, token);
    }
  }

  async getRefreshToken(): Promise<string | null> {
    if (this.tokenTransport === "storage") {
      return this.storage.getItem(this.storageKey);
    }
    return null;
  }

  async clearSession(): Promise<void> {
    this.accessToken = null;
    this.refreshPromise = null;
    if (this.tokenTransport === "storage") {
      try {
        await this.storage.removeItem(this.storageKey);
      } catch {}
      if (this.broadcastChannel) {
        try {
          this.broadcastChannel.postMessage({ type: "SIGNED_OUT" });
        } catch {}
      }
    }
  }

  /**
   * Single-flight guarded refresh with cross-tab coordination.
   */
  async refreshIfNeeded(): Promise<string> {
    // Join the initial restore if it hasn't completed yet
    await this.ready;

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.executeRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async executeRefresh(): Promise<string> {
    if (this.tokenTransport === "cookie") {
      return this.doRefreshCookie();
    }

    // Storage mode — check for Web Locks
    if (
      typeof navigator !== "undefined" &&
      navigator.locks &&
      typeof navigator.locks.request === "function"
    ) {
      return navigator.locks.request(this.lockKey, async () => {
        // If another tab won the lock and refreshed while we waited, we already have a fresh token!
        if (this.accessToken && Date.now() - this.lastRefreshAt < 5000) {
          return this.accessToken;
        }

        // Under the lock, re-read shared storage
        const currentToken = await this.storage.getItem(this.storageKey);
        if (!currentToken) {
          await this.clearSession();
          this.onSessionExpired();
          this.onSignedOut();
          throw new SentinelAuthError(
            "No refresh token found in storage",
            "AUTHENTICATION_ERROR",
            401
          );
        }
        return this.doRefreshStorage(currentToken);
      });
    }

    // Fallback when Web Locks unavailable
    const currentToken = await this.storage.getItem(this.storageKey);
    if (!currentToken) {
      await this.clearSession();
      this.onSessionExpired();
      this.onSignedOut();
      throw new SentinelAuthError(
        "No refresh token found in storage",
        "AUTHENTICATION_ERROR",
        401
      );
    }
    return this.doRefreshStorage(currentToken);
  }

  private async doRefreshCookie(): Promise<string> {
    try {
      const result = await this.httpClient.post<RefreshResponse>(
        "/api/auth/refresh",
        {}
      );
      if (result.refreshToken) {
        throw new SentinelAuthError(
          "CONFIGURATION_MISMATCH: Server returned refreshToken in response body while SDK is in cookie mode.",
          "CONFIGURATION_MISMATCH",
          500
        );
      }
      this.accessToken = result.accessToken;
      this.lastRefreshAt = Date.now();
      return result.accessToken;
    } catch (err: unknown) {
      this.accessToken = null;
      this.onSessionExpired();
      this.onSignedOut();
      throw err;
    }
  }

  private async doRefreshStorage(tokenToUse: string): Promise<string> {
    try {
      const result = await this.httpClient.post<RefreshResponse>(
        "/api/auth/refresh",
        { refreshToken: tokenToUse }
      );

      if (!result.refreshToken) {
        throw new SentinelAuthError(
          "CONFIGURATION_MISMATCH: Server did not return a refreshToken in response body while SDK is in storage mode.",
          "CONFIGURATION_MISMATCH",
          500
        );
      }

      // Always store the token returned by refresh (grace retries return the same successor)
      await this.storage.setItem(this.storageKey, result.refreshToken);
      this.accessToken = result.accessToken;
      this.lastRefreshAt = Date.now();

      // Broadcast to other tabs
      if (this.broadcastChannel) {
        try {
          this.broadcastChannel.postMessage({
            type: "REFRESH_SUCCESS",
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
          });
        } catch {}
      }

      return result.accessToken;
    } catch (err: unknown) {
      await this.clearSession();
      this.onSessionExpired();
      this.onSignedOut();
      throw err;
    }
  }

  dispose(): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {}
      this.broadcastChannel = null;
    }
  }
}
