import app from 'app'
import { closeDatabase, initializeDatabase } from 'config/database'
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

  const server = app.listen(env.port, () => {
    logger.info(`Server listening on port ${env.port} in ${env.nodeEnv} mode.`)
    startAllTasks()
  })

  let shuttingDown = false

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    logger.info(`Received ${signal}; shutting down.`)

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out.')
      process.exit(1)
    }, 25_000)
    forceExit.unref()

    server.close(async error => {
      try {
        await closeDatabase()
      } catch (databaseError) {
        logger.error(
          'Unable to close database connection.',
          databaseError instanceof Error ? { message: databaseError.message } : databaseError
        )
        process.exitCode = 1
      }

      if (error) {
        logger.error('Unable to close HTTP server.', { message: error.message })
        process.exitCode = 1
      }

      clearTimeout(forceExit)
      process.exit(process.exitCode ?? 0)
    })
  }

  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

startServer().catch(error => {
  logger.error('Unable to start server.', error instanceof Error ? { message: error.message } : error)
  process.exit(1)
})
