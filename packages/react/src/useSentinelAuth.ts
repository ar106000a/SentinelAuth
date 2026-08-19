import { useContext, useCallback } from "react";
import { SentinelAuthContext } from "./SentinelAuthProvider.js";
import type {
  LoginResponse,
  UserRegistrationResponse,
  UserVerifyEmailResponse,
  ForgotPasswordResponse,
  ResetPasswordResponse,
  MfaSetupResponse,
  MfaVerifyResponse,
} from "@sentinelauth/types";

/**
 * Headless access to every SentinelAuth method, for tenants building
 * fully custom UI rather than using the wrapped components. Mirrors
 * the underlying SDK's method surface exactly -- this hook adds no
 * new behavior, only a React-idiomatic access point to it, thrown
 * loudly if used outside a SentinelAuthProvider (same "fail loud on
 * missing context" discipline as every SDK component's setSdk() guard).
 */
export function useSentinelAuth() {
  const sdk = useContext(SentinelAuthContext);

  if (!sdk) {
    throw new Error(
      "useSentinelAuth() must be used within a <SentinelAuthProvider>."
    );
  }

  const register = useCallback(
    (email: string, password: string): Promise<UserRegistrationResponse> =>
      sdk.register(email, password),
    [sdk]
  );

  const verifyEmail = useCallback(
    (email: string, otp: string): Promise<UserVerifyEmailResponse> =>
      sdk.verifyEmail(email, otp),
    [sdk]
  );

  const login = useCallback(
    (email: string, password: string): Promise<LoginResponse> =>
      sdk.login(email, password),
    [sdk]
  );

  const logout = useCallback(
    (accessToken?: string) => sdk.logout(accessToken),
    [sdk]
  );

  const refresh = useCallback(() => sdk.refresh(), [sdk]);

  const forgotPassword = useCallback(
    (email: string): Promise<ForgotPasswordResponse> =>
      sdk.forgotPassword(email),
    [sdk]
  );

  const resetPassword = useCallback(
    (email: string, otp: string, newPassword: string): Promise<ResetPasswordResponse> =>
      sdk.resetPassword(email, otp, newPassword),
    [sdk]
  );

  const setupMfa = useCallback(
    (accessToken?: string): Promise<MfaSetupResponse> => sdk.setupMfa(accessToken),
    [sdk]
  );

  const enableMfa = useCallback(
    (accessToken: string | undefined, code: string) =>
      sdk.enableMfa(accessToken, code),
    [sdk]
  );

  const disableMfa = useCallback(
    (accessToken: string | undefined, password: string, code: string) =>
      sdk.disableMfa(accessToken, password, code),
    [sdk]
  );

  const verifyMfa = useCallback(
    (sessionChallenge: string, code: string): Promise<MfaVerifyResponse> =>
      sdk.verifyMfa(sessionChallenge, code),
    [sdk]
  );

  const getAccessToken = useCallback(() => sdk.getAccessToken(), [sdk]);

  return {
    register,
    verifyEmail,
    login,
    logout,
    refresh,
    forgotPassword,
    resetPassword,
    setupMfa,
    enableMfa,
    disableMfa,
    verifyMfa,
    getAccessToken,
    /** Escape hatch — the raw SDK instance, for anything not wrapped above
     * (e.g. addEventListener("session-expired", ...) from SENT-1147). */
    sdk,
  };
}