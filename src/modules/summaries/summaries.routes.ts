import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { DailySummaryModel, YearlySummaryModel } from '@/models';
import { authMiddleware } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/async-handler';

const router = Router();
router.use(authMiddleware);

const dailyQuerySchema = z.object({
  dateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  stationId: z.string().optional(),
  nodeId: z.string().optional(),
  category: z.enum(['lokomotiv', 'korxona', 'qurulish', 'tamirlash']).optional(),
});

// Kunlik aggregate
router.get(
  '/daily',
  asyncHandler(async (req: Request, res: Response) => {
    const q = dailyQuerySchema.parse(req.query);
    const filter: Record<string, unknown> = {};

    // Worker scope
    if (req.user!.role === 'worker') {
      filter.stationId = req.user!.stationId;
    } else if (q.stationId) {
      filter.stationId = q.stationId;
    } else if (q.nodeId) {
      filter.nodeId = q.nodeId;
    }

    if (q.dateISO) {
      filter.dateISO = q.dateISO;
    } else if (q.startDate || q.endDate) {
      const range: Record<string, string> = {};
      if (q.startDate) range.$gte = q.startDate;
      if (q.endDate) range.$lte = q.endDate;
      filter.dateISO = range;
    }

    if (q.category) filter.category = q.category;

    const items = await DailySummaryModel.find(filter).sort({ dateISO: -1, stationId: 1 }).lean();
    res.json({ ok: true, items });
  }),
);

const yearlyQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  stationId: z.string().optional(),
  nodeId: z.string().optional(),
  category: z.enum(['lokomotiv', 'korxona', 'qurulish', 'tamirlash']).optional(),
});

router.get(
  '/yearly',
  asyncHandler(async (req: Request, res: Response) => {
    const q = yearlyQuerySchema.parse(req.query);
    const filter: Record<string, unknown> = { year: q.year };

    if (req.user!.role === 'worker') {
      filter.stationId = req.user!.stationId;
    } else if (q.stationId) {
      filter.stationId = q.stationId;
    } else if (q.nodeId) {
      filter.nodeId = q.nodeId;
    }

    if (q.category) filter.category = q.category;

    const items = await YearlySummaryModel.find(filter).sort({ stationId: 1 }).lean();
    res.json({ ok: true, items });
  }),
);

export { router as summariesRouter };
