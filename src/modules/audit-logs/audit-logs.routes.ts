import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuditLogModel } from '@/models';
import { authMiddleware, requireRole } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/async-handler';

const router = Router();
router.use(authMiddleware);
router.use(requireRole('admin', 'developer'));

const querySchema = z.object({
  userId: z.string().optional(),
  entityType: z.string().optional(),
  action: z.string().optional(),
  startMs: z.coerce.number().optional(),
  endMs: z.coerce.number().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  skip: z.coerce.number().int().min(0).default(0),
});

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const q = querySchema.parse(req.query);
    const filter: Record<string, unknown> = {};
    if (q.userId) filter.userId = q.userId;
    if (q.entityType) filter.entityType = q.entityType;
    if (q.action) filter.action = q.action;

    if (q.startMs || q.endMs) {
      const range: Record<string, number> = {};
      if (q.startMs) range.$gte = q.startMs;
      if (q.endMs) range.$lte = q.endMs;
      filter.timestamp = range;
    }

    const [items, total] = await Promise.all([
      AuditLogModel.find(filter).sort({ timestamp: -1 }).skip(q.skip).limit(q.limit).lean(),
      AuditLogModel.countDocuments(filter),
    ]);

    res.json({ ok: true, items, total, skip: q.skip, limit: q.limit });
  }),
);

// Statistika — qaysi rollar nimalar qildi
router.get(
  '/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const q = z.object({
      startMs: z.coerce.number().optional(),
      endMs: z.coerce.number().optional(),
    }).parse(req.query);

    const match: Record<string, unknown> = {};
    if (q.startMs || q.endMs) {
      const range: Record<string, number> = {};
      if (q.startMs) range.$gte = q.startMs;
      if (q.endMs) range.$lte = q.endMs;
      match.timestamp = range;
    }

    const byAction = await AuditLogModel.aggregate([
      { $match: match },
      { $group: { _id: { action: '$action', entityType: '$entityType' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const byUser = await AuditLogModel.aggregate([
      { $match: match },
      { $group: { _id: { userId: '$userId', userName: '$userName', userRole: '$userRole' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    res.json({ ok: true, byAction, byUser });
  }),
);

export { router as auditLogsRouter };
