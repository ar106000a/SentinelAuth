import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  adminEmail: text("admin_email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  publicKey: text("public_key").notNull(),
  secretKeyHash: text("secret_key_hash").notNull(),
  settings: jsonb("settings")
    .$type<{
      riskThreshold: number;
      failOpen: boolean;
    }>()
    .default({ riskThreshold: 0.7, failOpen: true }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;