const ACRONYMS: Record<string, string> = {
  mfa: "MFA",
  gdpr: "GDPR",
};

/**
 * Only the event types the doc actually names as literal strings —
 * "All events" plus these eight. There's likely a baseline event logged
 * for an ordinary successful login too (riskScore is a core field on
 * every row), but its exact string isn't documented anywhere, so it's
 * deliberately not guessed here. This list may not be exhaustive.
 */
export const KNOWN_EVENT_TYPES = [
  "tenant_password_reset",
  "key_rotated",
  "gdpr_user_deleted",
  "mfa_triggered",
  "mfa_success",
  "mfa_enabled",
  "mfa_disabled",
  "impossible_travel_detected",
] as const;

export function formatEventType(eventType: string): string {
  return eventType
    .split("_")
    .map(
      (word) => ACRONYMS[word] ?? word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}
