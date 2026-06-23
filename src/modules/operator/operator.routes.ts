import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { OperatorBalanceModel, OperatorLedgerModel, StationModel, AuditLogModel } from '@/models';
import { authMiddleware } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/async-handler';
import { ApiError } from '@/common/errors/api-error';
import { toDecimal, roundKg } from '@/common/utils/decimal';
import { operatorBalanceService } from './operator-balance.service';
import { broadcastBalanceChange } from '@/config/socket';

const router = Router();
router.use(authMiddleware);

function requireAdmin(req: Request) {
  const role = req.user!.role;
  if (role !== 'admin' && role !== 'developer') {
    throw ApiError.forbidden('Faqat admin/operator bajara oladi');
  }
}

// ─── GET /operator/balances — barcha zapravkalar (worker: faqat o'ziniki) ──
router.get(
  '/balances',
  asyncHandler(async (req: Request, res: Response) => {
    if (req.user!.role === 'worker') {
      const stationId = req.user!.stationId;
      if (!stationId) throw ApiError.forbidden('Zapravka biriktirilmagan');
      const one = await operatorBalanceService.get(stationId);
      const st = await StationModel.findById(stationId).lean();
      res.json({
        ok: true,
        items: [{ ...one, stationName: st?.name ?? stationId, nodeId: (st as { nodeId?: string })?.nodeId ?? '' }],
      });
      return;
    }
    const items = await operatorBalanceService.listAll();
    res.json({ ok: true, items });
  }),
);

// ─── GET /operator/balances/:stationId ────────────────────────────
router.get(
  '/balances/:stationId',
  asyncHandler(async (req: Request, res: Response) => {
    const stationId = String(req.params.stationId);
    if (req.user!.role === 'worker' && req.user!.stationId !== stationId) {
      throw ApiError.forbidden('Boshqa zapravka balansini ko\'ra olmaysiz');
    }
    const one = await operatorBalanceService.get(stationId);
    const st = await StationModel.findById(stationId).lean();
    res.json({
      ok: true,
      balance: { ...one, stationName: st?.name ?? stationId, nodeId: (st as { nodeId?: string })?.nodeId ?? '' },
    });
  }),
);

// ─── POST /operator/balances/:stationId/receive ───────────────────
const receiveSchema = z.object({
  amountKg: z.union([z.number(), z.string()]),
  note: z.string().optional(),
});
router.post(
  '/balances/:stationId/receive',
  asyncHandler(async (req: Request, res: Response) => {
    requireAdmin(req);
    const stationId = String(req.params.stationId);
    const body = receiveSchema.parse(req.body);
    const amountKg = roundKg(toDecimal(body.amountKg));
    if (amountKg <= 0) throw ApiError.badRequest('amountKg 0 dan katta bo\'lishi kerak');

    const st = await StationModel.findById(stationId).lean();
    if (!st) throw ApiError.notFound('Zapravka topilmadi');
    const nodeId = (st as { nodeId?: string }).nodeId ?? '';

    const next = await operatorBalanceService.receive(stationId, amountKg, {
      nodeId,
      by: req.user!.code,
      byName: req.user!.displayName,
      note: body.note,
    });

    broadcastBalanceChange(stationId, nodeId, { ...next, stationId });
    await AuditLogModel.create({
      userId: req.user!.code,
      userName: req.user!.displayName,
      userRole: req.user!.role,
      action: 'create',
      entityType: 'operator-balance',
      entityId: stationId,
      changes: { receive: { old: null, new: amountKg } },
    });

    res.json({ ok: true, stationId, ...next });
  }),
);

// ─── POST /operator/balances/:stationId/adjust — qo'lda tuzatish ──
const adjustSchema = z.object({
  balanceKg: z.union([z.number(), z.string()]).optional(),
  overlimitKg: z.union([z.number(), z.string()]).optional(),
  note: z.string().optional(),
});
router.post(
  '/balances/:stationId/adjust',
  asyncHandler(async (req: Request, res: Response) => {
    requireAdmin(req);
    const stationId = String(req.params.stationId);
    const body = adjustSchema.parse(req.body);
    const st = await StationModel.findById(stationId).lean();
    if (!st) throw ApiError.notFound('Zapravka topilmadi');
    const nodeId = (st as { nodeId?: string }).nodeId ?? '';

    const next = await operatorBalanceService.adjust(
      stationId,
      {
        balanceKg: body.balanceKg !== undefined ? roundKg(toDecimal(body.balanceKg)) : undefined,
        overlimitKg: body.overlimitKg !== undefined ? roundKg(toDecimal(body.overlimitKg)) : undefined,
      },
      { nodeId, by: req.user!.code, byName: req.user!.displayName, note: body.note },
    );

    broadcastBalanceChange(stationId, nodeId, { ...next, stationId });
    res.json({ ok: true, stationId, ...next });
  }),
);

// ─── GET /operator/overlimits — overlimit > 0 bo'lgan zapravkalar ──
router.get(
  '/overlimits',
  asyncHandler(async (req: Request, res: Response) => {
    if (req.user!.role === 'worker') {
      const stationId = req.user!.stationId;
      if (!stationId) throw ApiError.forbidden('Zapravka biriktirilmagan');
      const one = await operatorBalanceService.get(stationId);
      res.json({ ok: true, items: one.overlimitKg > 0 ? [one] : [] });
      return;
    }
    const all = await operatorBalanceService.listAll();
    res.json({ ok: true, items: all.filter((b) => b.overlimitKg > 0) });
  }),
);

// ─── GET /operator/ledger?stationId=&limit= ───────────────────────
const ledgerSchema = z.object({
  stationId: z.string().optional(),
  type: z.enum(['receive', 'consume', 'reverse', 'adjust']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});
router.get(
  '/ledger',
  asyncHandler(async (req: Request, res: Response) => {
    const q = ledgerSchema.parse(req.query);
    const filter: Record<string, unknown> = {};
    if (req.user!.role === 'worker') {
      filter.stationId = req.user!.stationId;
    } else if (q.stationId) {
      filter.stationId = q.stationId;
    }
    if (q.type) filter.type = q.type;
    const items = await OperatorLedgerModel.find(filter).sort({ timestamp: -1 }).limit(q.limit).lean();
    res.json({ ok: true, items });
  }),
);

export { router as operatorRouter };
