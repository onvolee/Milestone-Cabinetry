import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export const requestId = (req: Request, res: Response, next: NextFunction) => {
  const id = req.header('x-request-id') ?? randomUUID()
  res.setHeader('x-request-id', id)
  next()
}
