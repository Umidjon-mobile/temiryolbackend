import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authController } from './auth.controller';
import { authMiddleware } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/async-handler';

const router = Router();

// Login uchun rate limit: bitta IP dan daqiqasiga 10 marotaba
const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    ok: false,
    code: 'RATE_LIMITED',
    message: 'Juda ko\'p urinish. Birozdan keyin qayta urinib ko\'ring.',
  },
});

router.post('/login-code', loginLimiter, asyncHandler(authController.loginCode.bind(authController)));
router.post('/logout', authMiddleware, asyncHandler(authController.logout.bind(authController)));
router.get('/me', authMiddleware, asyncHandler(authController.me.bind(authController)));
router.post('/heartbeat', authMiddleware, asyncHandler(authController.heartbeat.bind(authController)));

export { router as authRouter };
