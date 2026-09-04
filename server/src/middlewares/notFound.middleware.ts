import type { Request, Response } from 'express'

export const notFound = (req: Request, res: Response) => {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.originalUrl}` } })
}
