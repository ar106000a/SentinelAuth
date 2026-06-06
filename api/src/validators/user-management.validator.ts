import { z } from "zod";

export const userListQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;
