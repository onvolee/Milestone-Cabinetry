import { Router } from 'express'
import healthCheckRouter from 'routes/healthCheck/healthCheck.router'

const router = Router()

router.use(healthCheckRouter)

export default router
