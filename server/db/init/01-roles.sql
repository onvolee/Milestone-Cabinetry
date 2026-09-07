\set ON_ERROR_STOP on
\getenv database_name POSTGRES_DB
\getenv migration_password MIGRATION_DB_PASSWORD
\getenv runtime_password DB_PASSWORD

SELECT 'CREATE ROLE migration_user LOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migration_user') \gexec
ALTER ROLE migration_user LOGIN PASSWORD :'migration_password';
GRANT CONNECT ON DATABASE :"database_name" TO migration_user;
GRANT USAGE, CREATE ON SCHEMA public TO migration_user;

SELECT 'CREATE ROLE runtime_user LOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'runtime_user') \gexec
ALTER ROLE runtime_user LOGIN PASSWORD :'runtime_password';
GRANT CONNECT ON DATABASE :"database_name" TO runtime_user;
GRANT USAGE ON SCHEMA public TO runtime_user;

ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO runtime_user;

ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO runtime_user;
