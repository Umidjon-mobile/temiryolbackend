import { Router, Request, Response } from 'express';
import { NodeModel, StationModel } from '@/models';
import { authMiddleware } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/async-handler';
import { getLimitsSettings } from '@/modules/limits/limits.helper';
import { ApprovalModel } from '@/models';

const router = Router();
router.use(authMiddleware);

/**
 * Worker panel bootstrap — sahifa ochilganda barcha kerakli ma'lumot bir so'rovda.
 */
router.get(
  '/bootstrap',
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user!;
    const stationId = user.stationId;
    const nodeId = user.nodeId;

    const [nodes, stations, settings, activeApprovals] = await Promise.all([
      NodeModel.find().lean(),
      StationModel.find().lean(),
      getLimitsSettings(),
      stationId
        ? ApprovalModel.find({
            stationId,
            isActive: true,
            validUntil: { $gt: Date.now() },
          }).lean()
        : Promise.resolve([]),
    ]);

    const currentStation = stationId ? stations.find((s) => s._id === stationId) : null;
    const currentNode = nodeId ? nodes.find((n) => n._id === nodeId) : null;

    res.json({
      ok: true,
      user: {
        code: user.code,
        role: user.role,
        displayName: user.displayName,
        stationId: user.stationId,
        nodeId: user.nodeId,
      },
      currentStation,
      currentNode,
      nodes,
      stations,
      limitsSettings: settings,
      activeApprovals,
      serverTime: Date.now(),
    });
  }),
);

export { router as userPanelRouter };
