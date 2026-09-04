require('dotenv').config({ path: `.env.${process.env.NODE_ENV ?? 'local'}` })

const shared = {
  dialect: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  logging: false
}

module.exports = {
  local: shared,
  staging: shared,
  production: shared
}
