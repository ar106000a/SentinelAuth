import { z } from "zod";

const VALID_EVENT_TYPES = [
  "login_success",
  "login_failed",
  "mfa_triggered",
  "mfa_success",
  "mfa_failed",
  "key_rotated",
  "credential_stuffing_detected",
  "velocity_anomaly_detected",
  "impossible_travel_detected",
  "hibp_check_failed",
] as const;

export const auditLogQuerySchema = z.object({
  eventType: z.enum(VALID_EVENT_TYPES).optional(),
  fromDate: z.iso
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  toDate: z.iso
    .datetime()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
