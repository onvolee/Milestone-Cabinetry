CREATE ROLE rds_iam NOLOGIN;

CREATE USER migration_user WITH PASSWORD 'migration_password';
GRANT rds_iam TO migration_user;
GRANT CONNECT ON DATABASE milestone_cabinetry TO migration_user;
GRANT USAGE, CREATE ON SCHEMA public TO migration_user;

CREATE USER developer WITH PASSWORD 'developer_password';
GRANT rds_iam TO developer;
GRANT CONNECT ON DATABASE milestone_cabinetry TO developer;
GRANT USAGE ON SCHEMA public TO developer;

ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO developer;

ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO developer;
