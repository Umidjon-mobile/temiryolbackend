import { Router, Request, Response } from 'express';
import { NodeModel, StationModel } from '@/models';
import { authMiddleware } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/async-handler';

const router = Router();
router.use(authMiddleware);

router.get(
  '/nodes',
  asyncHandler(async (_req: Request, res: Response) => {
    const nodes = await NodeModel.find().lean();
    res.json({ ok: true, nodes });
  }),
);

router.get(
  '/stations',
  asyncHandler(async (req: Request, res: Response) => {
    const filter: Record<string, unknown> = {};
    if (req.query.nodeId) filter.nodeId = req.query.nodeId;
    const stations = await StationModel.find(filter).lean();
    res.json({ ok: true, stations });
  }),
);

export { router as stationsRouter };
