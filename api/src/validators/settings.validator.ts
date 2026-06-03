import z from "zod";

export const updateSettingsSchema = z
  .object({
    riskThreshold: z
      .number()
      .min(0, "riskThreshold must be at least 0.0")
      .max(1, "riskThreshold must be at most 1.0")
      .optional(),
    failOpen: z.boolean().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one setting must be provided"
  );

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
