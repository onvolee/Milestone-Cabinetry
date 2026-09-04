import type { Request, Response } from 'express'
import { env } from 'config/env'

export const healthCheck = (_req: Request, res: Response) => {
  res.status(200).json({
    data: {
      status: 'ok',
      environment: env.nodeEnv,
      timestamp: new Date().toISOString()
    }
  })
}
