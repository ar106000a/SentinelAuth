import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 12;
export const registerTenantSchema = z.object({
  name: z
    .string()
    .min(2, " Name must be at least 2 characters long")
    .max(100, "Name must be under 100 characters")
    .trim(),
  adminEmail: z.email("Must be a valid Email Address").toLowerCase().trim(),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, "Password must be at least 12 characters long")
    .max(128, "Password must be under 128 characters"),
});
export type RegisterTenantInput = z.infer<typeof registerTenantSchema>;

export const verifyEmailSchema = z.object({
  adminEmail: z.email().toLowerCase().trim(),
  otp: z
    .string()
    .length(6, "otp must be exactly 6 digits")
    .regex(/^\d+$/, "OTP must be numeric"),
});

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const tenantForgotPasswordSchema = z.object({
  adminEmail: z.email().toLowerCase().trim(),
});

export const tenantResetPasswordSchema = z.object({
  adminEmail: z.email().toLowerCase().trim(),
  otp: z
    .string()
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d+$/, "OTP must be numeric"),
  newPassword: z.string().min(12).max(128),
});

export type TenantForgotPasswordInput = z.infer<
  typeof tenantForgotPasswordSchema
>;
export type TenantResetPasswordInput = z.infer<
  typeof tenantResetPasswordSchema
>;
