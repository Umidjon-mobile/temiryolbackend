import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { FuelRecordModel } from '@/models';
import { authMiddleware } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/async-handler';

const router = Router();
router.use(authMiddleware);

const querySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  stationId: z.string().optional(),
  nodeId: z.string().optional(),
  category: z.enum(['lokomotiv', 'korxona', 'qurulish', 'tamirlash']).optional(),
  moveType: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(10000).default(500),
  skip: z.coerce.number().int().min(0).default(0),
});

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const q = querySchema.parse(req.query);
    const filter: Record<string, unknown> = {};

    if (req.user!.role === 'worker') {
      filter.stationId = req.user!.stationId;
    } else {
      if (q.stationId) filter.stationId = q.stationId;
      if (q.nodeId) filter.nodeId = q.nodeId;
    }

    if (q.startDate || q.endDate) {
      const range: Record<string, string> = {};
      if (q.startDate) range.$gte = q.startDate;
      if (q.endDate) range.$lte = q.endDate;
      filter.dateISO = range;
    }

    if (q.category) filter.category = q.category;
    if (q.moveType) filter.moveType = q.moveType;

    const [items, total] = await Promise.all([
      FuelRecordModel.find(filter).sort({ timestamp: 1 }).skip(q.skip).limit(q.limit).lean(),
      FuelRecordModel.countDocuments(filter),
    ]);

    res.json({ ok: true, items, total, skip: q.skip, limit: q.limit });
  }),
);

export { router as fuelRecordsRouter };
