import { Router, Request, Response } from 'express';
import { SessionModel } from '@/models';
import { authMiddleware, requireRole } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/async-handler';

const router = Router();
router.use(authMiddleware);

const ONLINE_THRESHOLD_MS = 120_000; // 2 daqiqa

// Onlayn jadval — admin uchun
router.get(
  '/',
  requireRole('admin', 'developer'),
  asyncHandler(async (_req: Request, res: Response) => {
    const sessions = await SessionModel.find().sort({ lastSeen: -1 }).lean();
    const now = Date.now();

    const items = sessions.map((s) => ({
      sessionId: String(s._id),
      code: s.code,
      role: s.role,
      stationId: s.stationId,
      nodeId: s.nodeId,
      displayName: s.displayName,
      staffVaultFullName: s.staffVaultFullName,
      lastSeen: s.lastSeen,
      isOnline: typeof s.lastSeen === 'number' && now - s.lastSeen < ONLINE_THRESHOLD_MS,
    }));

    res.json({ ok: true, items, total: items.length, onlineCount: items.filter((i) => i.isOnline).length });
  }),
);

// Heartbeat — har 30 sekundda chaqiruv (auth ichida ham lastSeen yangilanadi)
router.post(
  '/heartbeat',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.sessionId) {
      return res.status(401).json({ ok: false, message: 'Sessiya yo\'q' });
    }
    await SessionModel.updateOne({ _id: req.sessionId }, { $set: { lastSeen: Date.now() } });
    return res.json({ ok: true, lastSeen: Date.now() });
  }),
);

export { router as presenceRouter };
