import { Router } from 'express'
import { healthCheck } from 'routes/healthCheck/healthCheck.controller'

const router = Router()

router.get('/health', healthCheck)

export default router
