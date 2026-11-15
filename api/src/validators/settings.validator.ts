import z from "zod";

export const allowedOriginSchema = z.string().transform((val, ctx) => {
  const trimmed = val.trim();
  if (trimmed.includes("*")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Wildcards are not allowed in origins",
    });
    return z.NEVER;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Origin must use http or https scheme",
      });
      return z.NEVER;
    }
    if (url.pathname !== "/" && url.pathname !== "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Origin must not include a path",
      });
      return z.NEVER;
    }
    return url.origin;
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid origin URL",
    });
    return z.NEVER;
  }
});

export const updateSettingsSchema = z
  .object({
    riskThreshold: z
      .number()
      .min(0, "riskThreshold must be at least 0.0")
      .max(1, "riskThreshold must be at most 1.0")
      .optional(),
    failOpen: z.boolean().optional(),
    allowedOrigins: z.array(allowedOriginSchema).optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    "At least one setting must be provided"
  );

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
