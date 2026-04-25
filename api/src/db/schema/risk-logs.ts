import {
  pgTable,
  uuid,
  text,
  timestamp,
  real,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { users } from "./users";

export const riskLogs = pgTable("risk_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  eventType: text("event_type").notNull(),
  riskScore: real("risk_score"),
  mfaTriggered: boolean("mfa_triggered").notNull().default(false),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  fingerprint: text("fingerprint"),
  geoLat: text("geo_lat"),
  geoLng: text("geo_lng"),
  features: jsonb("features").$type<Record<string, number>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type RiskLog = typeof riskLogs.$inferSelect;
export type NewRiskLog = typeof riskLogs.$inferInsert;
