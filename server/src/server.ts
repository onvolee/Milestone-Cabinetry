import app from 'app'
import { initializeDatabase } from 'config/database'
import { env } from 'config/env'
import { startAllTasks } from 'tasks'
import logger from 'utils/logger'

const startServer = async () => {
  const databaseConnected = await initializeDatabase()

  if (databaseConnected) {
    logger.info('Database connection established.')
  } else {
    logger.warn('Database is not configured; starting without a database connection.')
  }

  app.listen(env.port, () => {
    logger.info(`Server listening on port ${env.port} in ${env.nodeEnv} mode.`)
    startAllTasks()
  })
}

startServer().catch(error => {
  logger.error('Unable to start server.', error instanceof Error ? { message: error.message } : error)
  process.exit(1)
})
