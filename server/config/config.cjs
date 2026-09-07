require('dotenv').config({ path: `.env.${process.env.NODE_ENV ?? 'local'}` })

const isMigrationUser = process.env.DB_USERNAME === 'migration_user'

const shared = {
  dialect: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  username: process.env.DB_USERNAME,
  password: isMigrationUser
    ? process.env.MIGRATION_DB_PASSWORD
    : process.env.DB_PASSWORD,
  logging: false
}

module.exports = {
  local: shared,
  staging: shared,
  production: shared
}
