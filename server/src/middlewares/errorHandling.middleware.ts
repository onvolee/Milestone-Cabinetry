import type { ErrorRequestHandler } from 'express'
import logger from 'utils/logger'

export const errorHandling: ErrorRequestHandler = (error, _req, res, _next) => {
  logger.error('Unhandled request error', error instanceof Error ? { message: error.message } : error)
  res.status(500).json({ error: { message: 'Internal server error' } })
}
