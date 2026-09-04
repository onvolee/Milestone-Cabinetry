import { initializeDatabase, sequelize } from 'config/database'
import logger from 'utils/logger'

declare const process: { exitCode?: number }

const checkDatabase = async () => {
  const connected = await initializeDatabase()

  if (!connected || !sequelize) {
    throw new Error('Database is not configured. Set DB_HOST, DB_NAME, and DB_USERNAME.')
  }

  logger.info('Database connection established.')
  await sequelize.close()
}

checkDatabase().catch(error => {
  logger.error(
    'Database connection failed.',
    error instanceof Error ? { message: error.message } : error
  )
  process.exitCode = 1
})
