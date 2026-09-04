# Milestone Cabinetry Server

Express 5 and TypeScript API service, structured to match the Oasis server while starting without business-specific code.

## Commands

- `yarn dev` starts the API in local mode.
- `yarn build` compiles TypeScript to `dist`.
- `yarn lint` checks the source files.
- `yarn migrate:local` runs Sequelize migrations once database credentials are configured.

Copy `.env.example` to `.env.local` before configuring the local database. The health endpoint is available at `GET /api/health` and can run without database configuration.

## Connect to an AWS RDS PostgreSQL test instance

This repository supports two connection modes:

- `DB_AUTH_MODE=password`: static `DB_PASSWORD`, useful for a first connectivity check.
- `DB_AUTH_MODE=iam`: the recommended RDS mode. Sequelize asks AWS for a short-lived IAM database token before each physical connection. The PostgreSQL user must have the `rds_iam` role.

The RDS master password can still be managed and rotated by Secrets Manager. It is not used by the IAM application connection; use it only to initialize database users or for emergency administration.

1. In the AWS console, create **RDS for PostgreSQL**, not Aurora. For a low-cost test instance choose the Free tier template when available, Single-AZ, the smallest eligible burstable class, 20 GiB gp3, and no proxy/read replica/Multi-AZ. Enable **Manage master credentials in AWS Secrets Manager** and **Password and IAM database authentication**. Temporarily enable public access only if needed for local testing, and restrict the security group inbound rule to your current IP `/32` on port `5432`.
2. Wait until the instance is `Available`. Copy its endpoint hostname, database name, port, AWS region, and the Secrets Manager secret ARN. Do not put the secret value in the repository.
3. Download the RDS CA bundle from the repository's `server` directory:

   ```bash
   cd server
   mkdir -p .certs
   curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
     -o .certs/rds-global-bundle.pem
   ```

4. Create the local environment file without overwriting an existing one:

   ```bash
   cp -n .env.example .env.local
   ```

   Edit `server/.env.local` and set:

   ```dotenv
   NODE_ENV=local
   AWS_REGION=<the RDS region>
   # AWS_PROFILE=<your named profile, only if needed>
   DB_AUTH_MODE=iam
   DB_SSL_CA_PATH=.certs/rds-global-bundle.pem
   DB_HOST=<RDS endpoint, without https://>
   DB_PORT=5432
   DB_NAME=<database name>
   DB_USERNAME=migration_user
   DB_PASSWORD=
   ```

5. Verify that the AWS identity used by the local SDK is the personal account that owns this RDS instance. If a named profile is configured, export it before running the app:

   ```bash
   export AWS_PROFILE=<your profile>
   aws sts get-caller-identity
   ```

6. An administrator must grant the IAM identity permission for this exact database user. First retrieve the instance resource ID:

   ```bash
   aws rds describe-db-instances \
     --db-instance-identifier <instance-id> \
     --query 'DBInstances[0].DbiResourceId' --output text
   ```

   Add an IAM policy whose resource is:

   ```text
   arn:aws:rds-db:<region>:<account-id>:dbuser:<dbi-resource-id>/migration_user
   ```

   The action is `rds-db:connect`. The ARN uses the **DbiResourceId**, not the DB instance identifier.

7. Using the Secrets Manager-managed master account, connect once with `psql` or a database client and run:

   On macOS, if `psql` is not installed:

   ```bash
   brew install libpq
   ```

   Retrieve the current master password in the Secrets Manager console, paste it into the hidden prompt, and then run:

   ```bash
   read -s RDS_MASTER_PASSWORD
   PGPASSWORD="$RDS_MASTER_PASSWORD" "$(brew --prefix libpq)/bin/psql" \
     "host=<RDS endpoint> port=5432 dbname=<database name> user=<master username> sslmode=verify-full sslrootcert=.certs/rds-global-bundle.pem"
   unset RDS_MASTER_PASSWORD
   ```

   In that `psql` session run:

   ```sql
   CREATE USER migration_user;
   GRANT rds_iam TO migration_user;
   GRANT CONNECT ON DATABASE <database name> TO migration_user;
   GRANT USAGE, CREATE ON SCHEMA public TO migration_user;
   ```

   Grant the schema/table privileges needed by migrations separately. Do not grant `rds_iam` to the master user.

8. From this `server` directory, test the application connection:

   ```bash
   yarn db:check
   ```

   A successful result is `Database connection established.`. Then start the API with `yarn dev`. Do not run migration commands until this check succeeds; migration-specific IAM handling will be added in the next step.

The code requires the CA bundle for AWS RDS connections and refreshes IAM tokens for new pool connections. It never logs the token or the Secrets Manager password.
