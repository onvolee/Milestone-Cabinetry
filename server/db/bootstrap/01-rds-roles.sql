\set ON_ERROR_STOP on

-- Run this file while connected to the target application database as the
-- RDS master user. Pass database_name with psql's --set option.
BEGIN;

DO $bootstrap$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migration_user') THEN
    CREATE ROLE migration_user LOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runtime_user') THEN
    CREATE ROLE runtime_user LOGIN;
  END IF;
END
$bootstrap$;

-- These are IAM-only users in RDS. Database privileges remain separate from
-- the AWS IAM policies that grant rds-db:connect.
ALTER ROLE migration_user LOGIN PASSWORD NULL;
ALTER ROLE runtime_user LOGIN PASSWORD NULL;

GRANT rds_iam TO migration_user;
GRANT rds_iam TO runtime_user;

-- ALTER DEFAULT PRIVILEGES FOR another role requires membership in that role.
-- Keep the RDS master account able to administer objects owned by migrations.
DO $bootstrap$
BEGIN
  EXECUTE format('GRANT migration_user TO %I', current_user);
END
$bootstrap$;

GRANT CONNECT ON DATABASE :"database_name" TO migration_user;
GRANT USAGE, CREATE ON SCHEMA public TO migration_user;

GRANT CONNECT ON DATABASE :"database_name" TO runtime_user;
GRANT USAGE ON SCHEMA public TO runtime_user;

ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO runtime_user;

ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO runtime_user;

-- Membership is needed only while the master configures migration_user's
-- default privileges. Leaving it in place would make rds_iam authentication
-- take precedence over the RDS-managed master password on later bootstrap runs.
DO $bootstrap$
BEGIN
  EXECUTE format('REVOKE migration_user FROM %I', current_user);
END
$bootstrap$;

COMMIT;
