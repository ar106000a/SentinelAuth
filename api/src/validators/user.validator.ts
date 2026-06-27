import { z } from "zod";

export const registerUserSchema = z.object({
  email: z.email().toLowerCase().trim(),
  password: z.string().min(8).max(128),
});

export const verifyUserEmailSchema = z.object({
  email: z.email().toLowerCase().trim(),
  otp: z
    .string()
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d+$/, "OTP must be numeric"),
});
export const loginUserSchema = z.object({
  email: z.email().toLowerCase().trim(),
  password: z.string().min(1, "Password is required"),
  fingerprint: z.string().optional(),
});

export const userForgotPasswordSchema = z.object({
  email: z.string().toLowerCase().trim(),
});

export const userResetPasswordSchema = z.object({
  email: z.string().toLowerCase().trim(),
  otp: z
    .string()
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d+$/, "OTP must be numeric"),
  newPassword: z.string().min(8).max(128),
});

export type UserForgotPasswordInput = z.infer<typeof userForgotPasswordSchema>;
export type UserResetPasswordInput = z.infer<typeof userResetPasswordSchema>;

export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type VerifyUserEmailInput = z.infer<typeof verifyUserEmailSchema>;
export type LoginUserInput = z.infer<typeof loginUserSchema>;
