import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

router.get('/health', (_req, res) => {
  const dbState = mongoose.connection.readyState; // 0=disc, 1=conn, 2=conn'ing, 3=disc'ing
  const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] ?? 'unknown';

  res.json({
    ok: dbState === 1,
    service: 'temiryol-backend',
    uptime: process.uptime(),
    db: dbStatus,
    time: new Date().toISOString(),
  });
});

export { router as healthRouter };
