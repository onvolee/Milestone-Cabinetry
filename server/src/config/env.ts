import 'dotenv/config'

const splitOrigins = (value: string | undefined) =>
  value
    ?.split(',')
    .map(origin => origin.trim())
    .filter(Boolean) ?? []

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'local',
  port: Number(process.env.PORT ?? 3001),
  corsOrigins: splitOrigins(process.env.CORS_ORIGINS),
  awsRegion: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION,
  dbAuthMode: process.env.DB_AUTH_MODE ?? 'password',
  databaseUrl: process.env.DATABASE_URL,
  dbHost: process.env.DB_HOST,
  dbPort: Number(process.env.DB_PORT ?? 5432),
  dbName: process.env.DB_NAME,
  dbUsername: process.env.DB_USERNAME,
  dbPassword: process.env.DB_PASSWORD,
  dbSslCaPath: process.env.DB_SSL_CA_PATH
}
