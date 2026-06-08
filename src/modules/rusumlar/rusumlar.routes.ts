import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { LocomotiveSeriesModel } from '@/models/LocomotiveSeries';
import { AuditLogModel } from '@/models';
import { authMiddleware, requireRole } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/async-handler';
import { ApiError } from '@/common/errors/api-error';
import { ServerEvents } from '@/events';
import { getIO } from '@/config/socket';

const router = Router();
router.use(authMiddleware);

const createSchema = z.object({
  seriya: z.string().min(1).max(40).trim(),
  description: z.string().max(500).default(''),
  fuelTankCapacityKg: z.number().min(0).default(0),
});

const updateSchema = createSchema.partial().extend({ isActive: z.boolean().optional() });

// ─── List (worker ham o'qiy oladi) ───────────────────────────────
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const filter: Record<string, unknown> = {};
    if (req.query.activeOnly === 'true') filter.isActive = true;
    const items = await LocomotiveSeriesModel.find(filter).sort({ seriya: 1 }).lean();
    res.json({ ok: true, items, total: items.length });
  }),
);

// ─── Create — admin/developer ────────────────────────────────────
router.post(
  '/',
  requireRole('admin', 'developer'),
  asyncHandler(async (req: Request, res: Response) => {
    const input = createSchema.parse(req.body);
    const exists = await LocomotiveSeriesModel.findOne({ seriya: input.seriya.toUpperCase() }).lean();
    if (exists) throw ApiError.conflict('Bu rusum allaqachon mavjud');

    const doc = await LocomotiveSeriesModel.create({
      ...input,
      seriya: input.seriya.toUpperCase(),
      createdBy: req.user!.code,
    });

    await AuditLogModel.create({
      userId: req.user!.code,
      userName: req.user!.displayName,
      userRole: req.user!.role,
      action: 'create',
      entityType: 'rusum',
      entityId: String(doc._id),
      changes: { seriya: { old: null, new: input.seriya } },
    });

    getIO().to('admin').emit(ServerEvents.RUSUMLAR_UPDATED, { action: 'added', seriya: doc.seriya });

    res.status(201).json({ ok: true, rusum: doc.toObject() });
  }),
);

router.patch(
  '/:id',
  requireRole('admin', 'developer'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    const updates = updateSchema.parse(req.body);

    const existing = await LocomotiveSeriesModel.findById(id).lean();
    if (!existing) throw ApiError.notFound('Rusum topilmadi');

    if (updates.seriya) updates.seriya = updates.seriya.toUpperCase();

    const updated = await LocomotiveSeriesModel.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();

    await AuditLogModel.create({
      userId: req.user!.code,
      userName: req.user!.displayName,
      userRole: req.user!.role,
      action: 'update',
      entityType: 'rusum',
      entityId: id,
      changes: updates,
    });

    getIO().to('admin').emit(ServerEvents.RUSUMLAR_UPDATED, { action: 'updated', seriya: updated?.seriya });

    res.json({ ok: true, rusum: updated });
  }),
);

router.delete(
  '/:id',
  requireRole('admin', 'developer'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    const existing = await LocomotiveSeriesModel.findById(id).lean();
    if (!existing) throw ApiError.notFound('Rusum topilmadi');

    // Soft delete
    await LocomotiveSeriesModel.findByIdAndUpdate(id, { $set: { isActive: false } });

    await AuditLogModel.create({
      userId: req.user!.code,
      userName: req.user!.displayName,
      userRole: req.user!.role,
      action: 'delete',
      entityType: 'rusum',
      entityId: id,
      changes: { isActive: { old: true, new: false } },
    });

    getIO().to('admin').emit(ServerEvents.RUSUMLAR_UPDATED, { action: 'removed', seriya: existing.seriya });

    res.json({ ok: true });
  }),
);

export { router as rusumlarRouter };
