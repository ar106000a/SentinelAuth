import { z } from "zod";

export const mfaCodeSchema = z.object({
  code: z
    .string()
    .length(6, "Code must be exactly 6 digits")
    .regex(/^\d+$/, "Code must be numeric"),
});

export const mfaDisableSchema = z.object({
  password: z.string().min(1, "Password is required"),
  code: z
    .string()
    .length(6, "Code must be exactly 6 digits")
    .regex(/^\d+$/, "Code must be numeric"),
});

export type MfaCodeInput = z.infer<typeof mfaCodeSchema>;
export type MfaDisableInput = z.infer<typeof mfaDisableSchema>;
