import { createContext, useMemo, type ReactNode } from "react";
import { SentinelAuth, type SentinelAuthConfig } from "@sentinelauth/sdk";

export const SentinelAuthContext = createContext<SentinelAuth | null>(null);

export interface SentinelAuthProviderProps extends SentinelAuthConfig {
  children: ReactNode;
}

/**
 * Wraps a subtree with a single, shared SentinelAuth instance.
 *
 * The instance is created once via useMemo and never recreated across
 * re-renders (even if apiUrl/apiKey props somehow changed identity
 * without changing value -- deliberately not reactive to prop changes
 * beyond mount, since recreating the SDK instance mid-session would
 * silently drop the in-memory access token SENT-1147's SessionManager
 * is holding).
 */
export function SentinelAuthProvider({
  apiUrl,
  apiKey,
  children,
}: SentinelAuthProviderProps) {
  const sdk = useMemo(() => new SentinelAuth({ apiUrl, apiKey }), []);

  return (
    <SentinelAuthContext.Provider value={sdk}>
      {children}
    </SentinelAuthContext.Provider>
  );
}

////// eslint-disable-next-line react-hooks/exhaustive-deps (add these before useMemo deps array to supress any linting error in future)
