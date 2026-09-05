import { z } from "zod";

// Reusable date-range base — accepts "YYYY-MM-DD" strings
const dateRangeSchema = z.object({
  fromDate: z
    .string()
    .date()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  toDate: z
    .string()
    .date()
    .optional()
    .transform((v) => (v ? new Date(v + "T23:59:59.999Z") : undefined)),
});

export const loginVolumeQuerySchema = dateRangeSchema.extend({
  granularity: z.enum(["hour", "day", "week", "month"]).default("day"),
});

export const mfaRateQuerySchema = dateRangeSchema;

export const riskDistributionQuerySchema = dateRangeSchema;

export type LoginVolumeQuery = z.infer<typeof loginVolumeQuerySchema>;
export type MfaRateQuery = z.infer<typeof mfaRateQuerySchema>;
export type RiskDistributionQuery = z.infer<typeof riskDistributionQuerySchema>;
