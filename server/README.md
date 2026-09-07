# Milestone Cabinetry Server

Express 5 and TypeScript API service, structured to match the Oasis server while starting without business-specific code.

## Commands

- `yarn dev` starts the API in local mode.
- `yarn build` compiles TypeScript to `dist`.
- `yarn lint` checks the source files.
- `yarn migrate:local` runs Sequelize migrations once database credentials are configured.

The health endpoint is available at `GET /api/health` and can run without database configuration.

## Local PostgreSQL

Use one ignored local environment file for both the application and Docker:

```bash
cp -n .env.example .env.local
```

Set `POSTGRES_PASSWORD`, `MIGRATION_DB_PASSWORD`, and `DB_PASSWORD` in `.env.local`, then create or start the database:

```bash
yarn db:setup
```

The local initialization creates two PostgreSQL login roles:

- `migration_user` owns migration-created objects and can create objects in the `public` schema.
- `runtime_user` can use the schema and receives DML access to tables and sequences created later by `migration_user`.

Local PostgreSQL doesn't provide or need the RDS-managed `rds_iam` role. The local role passwords are read from the ignored `.env.local` file by `db/init/01-roles.sql`; they are not stored in the repository. `yarn db:setup` reapplies this idempotent script after PostgreSQL becomes healthy, so password changes also work with an existing data volume.

The application uses `runtime_user` by default. `yarn migrate:local` automatically selects `migration_user` and reads `MIGRATION_DB_PASSWORD`, so the application and migration credentials do not need to be swapped manually.

## CDK staging deployment

The staging API infrastructure is defined in the repository-level `infra/` package and deployed to `us-east-1`. CDK creates a dedicated two-AZ VPC, a private RDS PostgreSQL instance, an ECS Fargate service, and an API Gateway HTTPS endpoint. Fargate tasks run in public subnets for outbound access without a NAT gateway, but their security group only accepts application traffic from the API Gateway VPC link. RDS only accepts PostgreSQL traffic from the application and database-bootstrap task security groups.

Deploy the foundation first, run the idempotent role initialization task, then deploy and verify the application:

```bash
cd ../infra
yarn synth
yarn deploy:foundation
yarn bootstrap:database
yarn deploy:application --exclusively
yarn health
yarn drift
```

GitHub Actions performs these steps automatically for `milestone-staging-v*` tags and manual workflow runs. It authenticates through the repository's `AWS_DEPLOY_ROLE_ARN` OIDC variable, so no long-lived AWS credentials belong in GitHub.

Inspect a deployment before applying it:

```bash
yarn diff
```

The application stack outputs `apiUrl`, `apiBaseUrl`, and `healthUrl`. The generated API Gateway URL is used until a custom domain is configured.

The staging database intentionally has no deletion protection and is destroyed without a final snapshot if its resource is removed. The Foundation stack has CloudFormation termination protection to guard against accidental whole-stack deletion.

## Connect locally to an AWS RDS PostgreSQL test instance

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

4. Create the application environment file without overwriting an existing one:

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
   DB_USERNAME=runtime_user
   DB_PASSWORD=
   ```

5. Verify that the AWS identity used by the local SDK is the personal account that owns this RDS instance. If a named profile is configured, export it before running the app:

   ```bash
   export AWS_PROFILE=<your profile>
   aws sts get-caller-identity
   ```

6. An administrator must grant the runtime IAM identity permission for the `runtime_user` database user. Grant the deployment identity access to `migration_user` separately when IAM-enabled migrations are configured. First retrieve the instance resource ID:

   ```bash
   aws rds describe-db-instances \
     --db-instance-identifier <instance-id> \
     --query 'DBInstances[0].DbiResourceId' --output text
   ```

   Add `rds-db:connect` permissions for the database users used by each workload. For the runtime identity, the resource is:

   ```text
   arn:aws:rds-db:<region>:<account-id>:dbuser:<dbi-resource-id>/runtime_user
   ```

   The action is `rds-db:connect`. The ARN uses the **DbiResourceId**, not the DB instance identifier.

   If the migration job uses `migration_user`, give that job the same permission with `/migration_user` at the end of the ARN. Do not give the runtime identity migration access just to avoid configuring a separate migration identity.

7. RDS doesn't execute repository initialization files when an instance is created. After the instance is available, run the RDS bootstrap file once from a machine that can reach the database, using the Secrets Manager-managed master account:

   On macOS, if `psql` is not installed:

   ```bash
   brew install libpq
   ```

   Retrieve the current master password in the Secrets Manager console. The following command prompts for it without putting it in shell history:

   ```bash
   "$(brew --prefix libpq)/bin/psql" \
     "host=<RDS endpoint> port=5432 dbname=<database name> user=<master username> sslmode=verify-full sslrootcert=.certs/rds-global-bundle.pem" \
     --set=database_name=<database name> \
     --file=db/bootstrap/01-rds-roles.sql
   ```

   The bootstrap creates `migration_user` and `runtime_user` without passwords, grants the RDS-managed `rds_iam` role, and configures their database privileges. It is safe to run again. Do not grant `rds_iam` to the master user.

8. From this `server` directory, test the application connection:

   ```bash
   yarn db:check
   ```

   A successful result is `Database connection established.`. Then start the API with `yarn dev`. The application should connect as `runtime_user`; use `migration_user` only for schema migrations. Do not run IAM-authenticated migration commands until migration-specific IAM token handling is configured in Sequelize CLI.

The code requires the CA bundle for AWS RDS connections and refreshes IAM tokens for new pool connections. It never logs the token or the Secrets Manager password.
