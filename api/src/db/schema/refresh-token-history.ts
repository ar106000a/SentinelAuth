import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { sessions } from "./sessions";

/**
 * Refresh-token history table (body-mode only).
 *
 * Each row represents one issued refresh token within a session family.
 * tokenHash   – SHA-256 of the raw JWT (never the JWT itself).
 * consumedAt  – set when the token is rotated; NULL means it is current.
 * successorCiphertext – AES-256-GCM encrypted next refresh token stored
 *               temporarily so that a lost-response retry can recover without
 *               re-rotation. Nulled out once the grace window has passed.
 */
export const refreshTokenHistory = pgTable(
  "refresh_token_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    consumedAt: timestamp("consumed_at"),
    successorCiphertext: text("successor_ciphertext"),
  },
  (table) => [
    uniqueIndex("refresh_token_history_token_hash_unique").on(table.tokenHash),
    index("refresh_token_history_session_id_idx").on(table.sessionId),
    index("refresh_token_history_tenant_id_idx").on(table.tenantId),
  ]
);

export type RefreshTokenHistory = typeof refreshTokenHistory.$inferSelect;
export type NewRefreshTokenHistory = typeof refreshTokenHistory.$inferInsert;

