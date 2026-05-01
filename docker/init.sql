-- Create non-superuser application role
CREATE ROLE app_user WITH LOGIN PASSWORD 'app_user_password';

-- Grant database access
GRANT CONNECT ON DATABASE sentinelauth TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Ensure future tables are also covered
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;