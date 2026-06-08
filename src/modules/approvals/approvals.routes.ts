import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ApprovalModel } from '@/models';
import { authMiddleware, requireRole } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/async-handler';
import { ApiError } from '@/common/errors/api-error';
import { ServerEvents, Rooms } from '@/events';
import { getIO } from '@/config/socket';

const router = Router();
router.use(authMiddleware);

// Faol ruxsatnomalar — worker o'z zapravkasi uchun, admin barchasi uchun
router.get(
  '/active',
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user!;
    const stationId = (req.query.stationId as string) || (user.role === 'worker' ? user.stationId : null);

    const filter: Record<string, unknown> = {
      isActive: true,
      validUntil: { $gt: Date.now() },
    };
    if (stationId) filter.stationId = stationId;

    const items = await ApprovalModel.find(filter).sort({ approvedAt: -1 }).lean();
    res.json({ ok: true, items });
  }),
);

// Admin tomonidan ruxsatnoma berish
const createSchema = z.object({
  requestType: z.enum(['lokomotiv', 'korxona']),
  seriya: z.string().optional(),
  lokomotivNumber: z.string().optional(),
  requestKind: z.enum(['tashqari', 'oldinroq']).optional(),
  korxonaNomi: z.string().optional(),
  stationId: z.string().min(1),
  nodeId: z.string().min(1),
  sutkalikLimit: z.number().int().min(1).max(30), // necha sutka amal qiladi
  messageId: z.string().optional(),
});

router.post(
  '/',
  requireRole('admin', 'developer'),
  asyncHandler(async (req: Request, res: Response) => {
    const input = createSchema.parse(req.body);
    const admin = req.user!;

    if (input.requestType === 'lokomotiv' && (!input.seriya || !input.lokomotivNumber)) {
      throw ApiError.badRequest('Lokomotiv uchun seriya va lokomotivNumber majburiy');
    }
    if (input.requestType === 'korxona' && !input.korxonaNomi) {
      throw ApiError.badRequest('Korxona uchun korxonaNomi majburiy');
    }

    const now = Date.now();
    const doc = await ApprovalModel.create({
      messageId: input.messageId ?? null,
      requestType: input.requestType,
      seriya: input.seriya ?? null,
      lokomotivNumber: input.lokomotivNumber ?? null,
      requestKind: input.requestKind ?? null,
      korxonaNomi: input.korxonaNomi ?? null,
      stationId: input.stationId,
      nodeId: input.nodeId,
      approvedBy: admin.code,
      approvedByName: admin.displayName,
      approvedAt: now,
      sutkalikLimit: input.sutkalikLimit,
      validUntil: now + input.sutkalikLimit * 24 * 60 * 60 * 1000,
      isActive: true,
    });

    const io = getIO();
    io.to(Rooms.station(input.stationId)).emit(ServerEvents.APPROVAL_GRANTED, doc.toObject());
    io.to(Rooms.admin).emit(ServerEvents.APPROVAL_GRANTED, doc.toObject());

    res.status(201).json({ ok: true, approval: doc.toObject() });
  }),
);

// Bekor qilish
router.delete(
  '/:id',
  requireRole('admin', 'developer'),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const doc = await ApprovalModel.findByIdAndUpdate(id, { $set: { isActive: false } }, { new: true }).lean();
    if (!doc) throw ApiError.notFound('Ruxsatnoma topilmadi');

    const io = getIO();
    io.to(Rooms.station(doc.stationId)).emit(ServerEvents.APPROVAL_REJECTED, { id });
    io.to(Rooms.admin).emit(ServerEvents.APPROVAL_REJECTED, { id });

    res.json({ ok: true });
  }),
);

export { router as approvalsRouter };
