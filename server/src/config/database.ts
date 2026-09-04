import { Signer } from '@aws-sdk/rds-signer'
import { readFileSync } from 'node:fs'
import { Sequelize } from 'sequelize'
import { env } from 'config/env'

const hasDatabaseConfiguration = Boolean(env.databaseUrl || (env.dbHost && env.dbName && env.dbUsername))

const createSequelize = () => {
  const authMode = env.dbAuthMode.toLowerCase()

  if (!['password', 'iam'].includes(authMode)) {
    throw new Error('DB_AUTH_MODE must be either "password" or "iam".')
  }

  if (env.databaseUrl) {
    if (authMode === 'iam') {
      throw new Error('DATABASE_URL cannot be used with DB_AUTH_MODE=iam. Set the individual DB_* variables.')
    }

    return new Sequelize(env.databaseUrl, { logging: false })
  }

  if (!env.dbHost || !env.dbName || !env.dbUsername) {
    return null
  }

  const useIamAuthentication = authMode === 'iam'
  const useTls = Boolean(env.dbSslCaPath) || env.dbHost.endsWith('.rds.amazonaws.com')

  if (useTls && !env.dbSslCaPath) {
    throw new Error('DB_SSL_CA_PATH is required for an AWS RDS connection.')
  }

  if (useIamAuthentication) {
    if (!env.awsRegion) {
      throw new Error('AWS_REGION (or AWS_DEFAULT_REGION) is required when DB_AUTH_MODE=iam.')
    }

  }

  const signer = useIamAuthentication
    ? new Signer({
        hostname: env.dbHost,
        port: env.dbPort,
        region: env.awsRegion!,
        username: env.dbUsername
      })
    : null

  const sequelizeInstance = new Sequelize(env.dbName, env.dbUsername, env.dbPassword, {
    dialect: 'postgres',
    host: env.dbHost,
    port: env.dbPort,
    logging: false,
    dialectOptions: useTls
      ? {
          ssl: {
            ca: readFileSync(env.dbSslCaPath!, 'utf8'),
            rejectUnauthorized: true
          }
        }
      : undefined,
    hooks: useIamAuthentication
      ? {
          beforeConnect: async config => {
            config.password = await signer!.getAuthToken()
          }
        }
      : undefined
  })

  return sequelizeInstance
}

export const sequelize = hasDatabaseConfiguration ? createSequelize() : null

export const initializeDatabase = async () => {
  if (!sequelize) {
    return false
  }

  await sequelize.authenticate()
  return true
}
