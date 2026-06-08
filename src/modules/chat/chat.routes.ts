import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ChatMessageModel } from '@/models/ChatMessage';
import { authMiddleware } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/async-handler';
import { ApiError } from '@/common/errors/api-error';
import { ServerEvents, Rooms } from '@/events';
import { getIO } from '@/config/socket';

const router = Router();
router.use(authMiddleware);

const sendSchema = z.object({
  stationId: z.string().min(1),
  nodeId: z.string().min(1),
  text: z.string().min(1).max(2000).trim(),
  messageType: z
    .enum(['text', 'approval_request'])
    .default('text'),
  approvalRequest: z
    .object({
      requestType: z.enum(['lokomotiv', 'korxona']).optional(),
      seriya: z.string().optional(),
      lokomotivNumber: z.string().optional(),
      korxonaNomi: z.string().optional(),
      requestKind: z.enum(['tashqari', 'oldinroq']).optional(),
    })
    .optional(),
});

// ─── List ─────────────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const stationId =
      (req.query.stationId as string) || (req.user!.role === 'worker' ? req.user!.stationId : null);
    if (!stationId) throw ApiError.badRequest('stationId majburiy');

    // Worker faqat o'z stationi
    if (req.user!.role === 'worker' && req.user!.stationId !== stationId) {
      throw ApiError.forbidden('Boshqa zapravka chatini ko\'rolmaysiz');
    }

    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const items = await ChatMessageModel.find({ stationId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.json({ ok: true, items: items.reverse(), total: items.length });
  }),
);

// ─── Send ─────────────────────────────────────────────────────────
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const input = sendSchema.parse(req.body);
    const user = req.user!;

    // Worker faqat o'z stationi
    if (user.role === 'worker' && user.stationId !== input.stationId) {
      throw ApiError.forbidden('Faqat o\'z zapravkangiz chatiga yozolasiz');
    }

    const doc = await ChatMessageModel.create({
      stationId: input.stationId,
      nodeId: input.nodeId,
      senderCode: user.code,
      senderName: user.displayName,
      senderRole: user.role,
      text: input.text,
      messageType: input.messageType,
      approvalRequest: input.approvalRequest ?? {},
      readBy: [user.code],
      timestamp: Date.now(),
    });

    const payload = doc.toObject();

    // Realtime: shu station + barcha adminlar
    const io = getIO();
    io.to(Rooms.station(input.stationId)).emit(ServerEvents.CHAT_MESSAGE, payload);
    io.to(Rooms.admin).emit(ServerEvents.CHAT_MESSAGE, payload);

    res.status(201).json({ ok: true, message: payload });
  }),
);

// ─── Mark read ────────────────────────────────────────────────────
router.post(
  '/:id/read',
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id ?? '');
    await ChatMessageModel.updateOne({ _id: id }, { $addToSet: { readBy: req.user!.code } });
    res.json({ ok: true });
  }),
);

// ─── Unread count ─────────────────────────────────────────────────
router.get(
  '/unread-count',
  asyncHandler(async (req: Request, res: Response) => {
    const stationFilter =
      req.user!.role === 'worker'
        ? { stationId: req.user!.stationId }
        : (req.query.stationId ? { stationId: req.query.stationId as string } : {});

    const count = await ChatMessageModel.countDocuments({
      ...stationFilter,
      readBy: { $ne: req.user!.code },
    });

    res.json({ ok: true, count });
  }),
);

export { router as chatRouter };
