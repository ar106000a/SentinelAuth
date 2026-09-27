import z from "zod";

export const loginSchema = z.object({
  adminEmail: z.email().toLowerCase().trim(),
  password: z.string().min(1, "Password required"),
});