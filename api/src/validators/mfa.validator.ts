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
export const mfaVerifySchema = z.object({
  sessionChallenge: z.string().length(64, "Invalid session challenge"),
  code: z
    .string()
    .length(6, "Code must be exactly 6 digits")
    .regex(/^\d+$/, "Code must be numeric"),
});

export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export type MfaCodeInput = z.infer<typeof mfaCodeSchema>;
export type MfaDisableInput = z.infer<typeof mfaDisableSchema>;
