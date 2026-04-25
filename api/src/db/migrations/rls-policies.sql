-- Enable RLS on tenant-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_logs ENABLE ROW LEVEL SECURITY;

-- Isolation policies
CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation ON sessions
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation ON otp_tokens
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation ON risk_logs
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Force RLS even for table owner
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE otp_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE risk_logs FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE UNIQUE INDEX users_tenant_email_unique
ON users(tenant_id, email);

CREATE INDEX otp_tokens_user_type_idx
ON otp_tokens(user_id, type);