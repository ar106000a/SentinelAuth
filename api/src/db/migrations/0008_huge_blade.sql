CREATE TABLE "refresh_token_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"consumed_at" timestamp,
	"successor_ciphertext" text
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "refresh_idle_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "refresh_absolute_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "refresh_token_history" ADD CONSTRAINT "refresh_token_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_token_history" ADD CONSTRAINT "refresh_token_history_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_token_history_token_hash_unique" ON "refresh_token_history" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_token_history_session_id_idx" ON "refresh_token_history" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "refresh_token_history_tenant_id_idx" ON "refresh_token_history" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "refresh_token_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "refresh_token_history"
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "refresh_token_history" FORCE ROW LEVEL SECURITY;
