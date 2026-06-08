import { Router, Request, Response } from 'express';
import { AppSettingsModel } from '@/models/AppSettings';
import { authMiddleware, requireRole } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/async-handler';
import { getIO } from '@/config/socket';

const router = Router();
router.use(authMiddleware);

// ─── Get one ─────────────────────────────────────────────────────
router.get(
  '/:key',
  asyncHandler(async (req: Request, res: Response) => {
    const key = String(req.params.key);
    const doc = await AppSettingsModel.findById(key).lean();
    res.json({
      ok: true,
      key,
      value: doc?.value ?? null,
      updatedAt: doc?.updatedAt ?? null,
    });
  }),
);

// ─── Upsert (PATCH replaces value entirely) ──────────────────────
router.patch(
  '/:key',
  requireRole('admin', 'developer'),
  asyncHandler(async (req: Request, res: Response) => {
    const key = String(req.params.key);
    const value = req.body?.value ?? req.body;

    const updated = await AppSettingsModel.findByIdAndUpdate(
      key,
      {
        $set: {
          value,
          updatedAt: Date.now(),
          updatedBy: req.user!.code,
        },
      },
      { upsert: true, new: true },
    ).lean();

    if (!updated) {
      res.status(500).json({ ok: false, message: 'Saqlanmadi' });
      return;
    }

    getIO()
      .to('admin')
      .emit('app-settings.updated', { key, value: updated.value });
    getIO().emit('app-settings.updated', { key });

    res.json({ ok: true, key, value: updated.value, updatedAt: updated.updatedAt });
  }),
);

// ─── Delete (admin) ──────────────────────────────────────────────
router.delete(
  '/:key',
  requireRole('admin', 'developer'),
  asyncHandler(async (req: Request, res: Response) => {
    const key = String(req.params.key);
    await AppSettingsModel.findByIdAndDelete(key);
    getIO().to('admin').emit('app-settings.updated', { key, deleted: true });
    res.json({ ok: true, key, deleted: true });
  }),
);

export { router as appSettingsRouter };
