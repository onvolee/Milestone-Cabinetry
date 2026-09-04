import cors from 'cors'
import express from 'express'
import { env } from 'config/env'
import { errorHandling } from 'middlewares/errorHandling.middleware'
import { notFound } from 'middlewares/notFound.middleware'
import { requestId } from 'middlewares/requestId.middleware'
import apiRoutes from 'routes'

const app = express()

app.use(
  cors({
    origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
    credentials: true
  })
)
app.use(requestId)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api', apiRoutes)
app.use(notFound)
app.use(errorHandling)

export default app
