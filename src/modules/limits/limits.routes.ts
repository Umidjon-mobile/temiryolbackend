import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { LimitsSettingsModel } from '@/models';
import { authMiddleware, requireRole } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/async-handler';
import { getLimitsSettings } from './limits.helper';
import { ServerEvents } from '@/events';
import { getIO } from '@/config/socket';

const router = Router();
router.use(authMiddleware);

// Worker va admin ham o'qiy oladi
router.get(
  '/settings',
  asyncHandler(async (_req: Request, res: Response) => {
    const settings = await getLimitsSettings();
    res.json({ ok: true, settings });
  }),
);

// Update — admin/developer
const updateSchema = z.object({
  korxonaLimits: z.record(z.number()).optional(),
  qurulishLimits: z.record(z.number()).optional(),
  korxonaList: z.record(z.array(z.string())).optional(),
  qurulishKorxonaList: z.record(z.array(z.string())).optional(),
  buyruqEgalariList: z.record(z.array(z.string())).optional(),
  mashinaRaqamlari: z.record(z.array(z.string())).optional(),
  obyektList: z.record(z.array(z.string())).optional(),
  defaultLimit: z.number().min(0).optional(),
});

router.patch(
  '/settings',
  requireRole('admin', 'developer'),
  asyncHandler(async (req: Request, res: Response) => {
    const updates = updateSchema.parse(req.body);
    await LimitsSettingsModel.updateOne(
      { _id: 'singleton' },
      {
        $set: {
          ...updates,
          lastUpdated: Date.now(),
          updatedBy: req.user!.code,
        },
      },
      { upsert: true },
    );

    const fresh = await getLimitsSettings();
    getIO().to('admin').emit(ServerEvents.LIMITS_UPDATED, fresh);
    res.json({ ok: true, settings: fresh });
  }),
);

export { router as limitsRouter };
