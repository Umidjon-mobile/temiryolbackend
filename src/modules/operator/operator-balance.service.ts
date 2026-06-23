/**
 * Operator zapravka balansi — biznes logika.
 *
 * Domain: har zapravkaning yoqilg'i zaxira balansi (balanceKg) va undan oshib
 * ketgan qarz (overlimitKg) bor.
 *   - Worker submission (berildi) → balansdan ayiriladi (consume). Zaxiradan
 *     oshsa: balans 0 ga tushadi, oshig'i overlimitga qo'shiladi.
 *   - Operator yoqilg'i qabul qiladi (receive) → avval overlimit yopiladi,
 *     qolgani balansga qo'shiladi.
 *   - Submission o'chsa/kamaysa → yoqilg'i qaytadi (reverse == receive semantikasi).
 *
 * Yozish CAS (compare-and-set) optimistik tsikl bilan — bir vaqtda ikki
 * operatsiya bir zapravkaga tegsa ham balans buzilmaydi (race-safe).
 * Pure funksiyalar (computeConsume/computeReceive) — semantikaning yagona manbai,
 * unit testlar shularni tekshiradi.
 */

import { OperatorBalanceModel, OperatorLedgerModel, StationModel } from '@/models';
import { roundKg } from '@/common/utils/decimal';
import { logger } from '@/common/utils/logger';
import { broadcastBalanceChange } from '@/config/socket';

export interface BalanceState {
  balanceKg: number;
  overlimitKg: number;
}

// ─── Pure math (testlanadi) ───────────────────────────────────────

/** Berildi (consume): balansdan ayiradi, yetmasa overlimitga qo'shadi. */
export function computeConsume(state: BalanceState, amountKg: number): BalanceState {
  const amount = Math.max(0, amountKg);
  if (amount <= state.balanceKg) {
    return { balanceKg: roundKg(state.balanceKg - amount), overlimitKg: roundKg(state.overlimitKg) };
  }
  const deficit = amount - state.balanceKg;
  return { balanceKg: 0, overlimitKg: roundKg(state.overlimitKg + deficit) };
}

/** Qabul qilindi (receive): avval overlimitni yopadi, qolgani balansga. */
export function computeReceive(state: BalanceState, amountKg: number): BalanceState {
  const amount = Math.max(0, amountKg);
  const pay = Math.min(state.overlimitKg, amount);
  const remainder = amount - pay;
  return { balanceKg: roundKg(state.balanceKg + remainder), overlimitKg: roundKg(state.overlimitKg - pay) };
}

/**
 * Yoqilg'ini qaytarish (reverse) — submission o'chirilganda/kamayganda.
 * Semantik jihatdan receive bilan bir xil: avval qarz yopiladi, keyin balansga.
 */
export function computeReverse(state: BalanceState, amountKg: number): BalanceState {
  return computeReceive(state, amountKg);
}

// ─── Persistence (CAS) ────────────────────────────────────────────

type OpType = 'receive' | 'consume' | 'reverse' | 'adjust';

interface ApplyMeta {
  nodeId?: string;
  submissionId?: string | null;
  category?: string | null;
  by?: string;
  byName?: string;
  note?: string;
}

async function ensureDoc(stationId: string, nodeId?: string) {
  await OperatorBalanceModel.updateOne(
    { _id: stationId },
    { $setOnInsert: { _id: stationId, stationId, nodeId: nodeId ?? '', balanceKg: 0, overlimitKg: 0 } },
    { upsert: true },
  );
}

/**
 * Atomar yangilanish — MongoDB aggregation-pipeline update.
 * Bitta hujjat operatsiyasi sifatida bajariladi: balanceKg/overlimitKg hammasi
 * pipeline ICHIDA, hujjatning O'ZGARISHIDAN OLDINGI qiymatlaridan hisoblanadi,
 * shuning uchun lost-update / race condition bo'lishi mumkin emas (retry shart emas).
 *
 * MUHIM: ifoda computeConsume/computeReceive pure funksiyalari bilan AYNAN
 * bir xil bo'lishi shart (testlar shularni tekshiradi).
 */
function buildStage(type: OpType, A: number, now: number, nodeId?: string): Record<string, unknown> {
  const set: Record<string, unknown> = {};

  if (type === 'consume') {
    const enough = { $lte: [A, '$balanceKg'] };
    set.balanceKg = { $round: [{ $cond: [enough, { $subtract: ['$balanceKg', A] }, 0] }, 2] };
    set.overlimitKg = {
      $round: [{ $cond: [enough, '$overlimitKg', { $add: ['$overlimitKg', { $subtract: [A, '$balanceKg'] }] }] }, 2],
    };
    set.totalConsumedKg = { $round: [{ $add: [{ $ifNull: ['$totalConsumedKg', 0] }, A] }, 2] };
    set.lastConsumeAt = now;
  } else {
    // receive / reverse — bir xil semantika: avval overlimit yopiladi, qolgani balansga
    set.balanceKg = { $round: [{ $add: ['$balanceKg', { $max: [0, { $subtract: [A, '$overlimitKg'] }] }] }, 2] };
    set.overlimitKg = { $round: [{ $max: [0, { $subtract: ['$overlimitKg', A] }] }, 2] };
    if (type === 'receive') {
      set.totalReceivedKg = { $round: [{ $add: [{ $ifNull: ['$totalReceivedKg', 0] }, A] }, 2] };
      set.lastReceiveAt = now;
    } else {
      set.lastConsumeAt = now;
    }
  }

  if (nodeId) set.nodeId = nodeId;
  return { $set: set };
}

async function applyOp(
  stationId: string,
  type: OpType,
  amountKg: number,
  meta: ApplyMeta = {},
): Promise<BalanceState> {
  await ensureDoc(stationId, meta.nodeId);
  const A = roundKg(amountKg);
  const now = Date.now();

  const updated = await OperatorBalanceModel.findOneAndUpdate(
    { _id: stationId },
    [buildStage(type, A, now, meta.nodeId)],
    { new: true, upsert: true },
  ).lean();

  const next: BalanceState = {
    balanceKg: roundKg(updated?.balanceKg ?? 0),
    overlimitKg: roundKg(updated?.overlimitKg ?? 0),
  };

  await OperatorLedgerModel.create({
    stationId,
    nodeId: meta.nodeId ?? updated?.nodeId ?? '',
    type,
    amountKg: A,
    submissionId: meta.submissionId ?? null,
    category: meta.category ?? null,
    balanceAfter: next.balanceKg,
    overlimitAfter: next.overlimitKg,
    by: meta.by ?? '',
    byName: meta.byName ?? '',
    note: meta.note ?? '',
    timestamp: now,
  });

  return next;
}

// ─── Public operatsiyalar ─────────────────────────────────────────

export const operatorBalanceService = {
  computeConsume,
  computeReceive,
  computeReverse,

  /** Worker submission balansdan ayiradi. */
  async consume(stationId: string, amountKg: number, meta: ApplyMeta = {}) {
    if (!stationId || amountKg <= 0) return null;
    return applyOp(stationId, 'consume', amountKg, meta);
  },

  /** Submission o'chirildi/kamaydi → yoqilg'i qaytadi. */
  async reverse(stationId: string, amountKg: number, meta: ApplyMeta = {}) {
    if (!stationId || amountKg <= 0) return null;
    return applyOp(stationId, 'reverse', amountKg, meta);
  },

  /** Operator yoqilg'i qabul qildi. */
  async receive(stationId: string, amountKg: number, meta: ApplyMeta = {}) {
    if (!stationId || amountKg <= 0) return null;
    return applyOp(stationId, 'receive', amountKg, meta);
  },

  /**
   * Submission edit — eski va yangi kg farqini qo'llaydi.
   *   yangi > eski → qo'shimcha consume
   *   yangi < eski → farq qaytariladi (reverse)
   */
  async applyEdit(stationId: string, oldKg: number, newKg: number, meta: ApplyMeta = {}) {
    const delta = roundKg(newKg - oldKg);
    if (delta > 0) return this.consume(stationId, delta, meta);
    if (delta < 0) return this.reverse(stationId, -delta, meta);
    return null;
  },

  /** Admin qo'lda tuzatish (absolyut qiymat). */
  async adjust(stationId: string, next: Partial<BalanceState>, meta: ApplyMeta = {}) {
    await ensureDoc(stationId, meta.nodeId);
    const doc = await OperatorBalanceModel.findById(stationId).lean();
    const cur: BalanceState = { balanceKg: doc?.balanceKg ?? 0, overlimitKg: doc?.overlimitKg ?? 0 };
    const target: BalanceState = {
      balanceKg: roundKg(next.balanceKg ?? cur.balanceKg),
      overlimitKg: roundKg(next.overlimitKg ?? cur.overlimitKg),
    };
    await OperatorBalanceModel.updateOne({ _id: stationId }, { $set: target });
    await OperatorLedgerModel.create({
      stationId,
      nodeId: meta.nodeId ?? doc?.nodeId ?? '',
      type: 'adjust',
      amountKg: 0,
      balanceAfter: target.balanceKg,
      overlimitAfter: target.overlimitKg,
      by: meta.by ?? '',
      byName: meta.byName ?? '',
      note: meta.note ?? '',
      timestamp: Date.now(),
    });
    return target;
  },

  /** Bitta zapravka holati (yo'q bo'lsa 0/0). */
  async get(stationId: string): Promise<BalanceState & { stationId: string }> {
    const doc = await OperatorBalanceModel.findById(stationId).lean();
    return {
      stationId,
      balanceKg: roundKg(doc?.balanceKg ?? 0),
      overlimitKg: roundKg(doc?.overlimitKg ?? 0),
    };
  },

  /** Barcha zapravkalar — stansiya ro'yxati bilan left-join (yo'q balans = 0/0). */
  async listAll() {
    const [stations, balances] = await Promise.all([
      StationModel.find().lean(),
      OperatorBalanceModel.find().lean(),
    ]);
    const byId = new Map(balances.map((b) => [b.stationId, b]));
    return stations.map((st) => {
      const b = byId.get(st._id);
      return {
        stationId: st._id,
        stationName: st.name,
        nodeId: (st as { nodeId?: string }).nodeId ?? b?.nodeId ?? '',
        balanceKg: roundKg(b?.balanceKg ?? 0),
        overlimitKg: roundKg(b?.overlimitKg ?? 0),
        totalReceivedKg: roundKg(b?.totalReceivedKg ?? 0),
        totalConsumedKg: roundKg(b?.totalConsumedKg ?? 0),
        lastReceiveAt: b?.lastReceiveAt ?? null,
      };
    });
  },
};

/**
 * Submission yozilgandan keyin balansni yangilash — XATO YUTILADI.
 * Worker submission'ini hech qachon to'xtatmaslik uchun bu funksiya hech qachon
 * throw qilmaydi (faqat log qiladi). Balans "eventually consistent".
 */
function emit(stationId: string, nodeId: string, next: BalanceState | null) {
  if (next) broadcastBalanceChange(stationId, nodeId, { ...next, stationId });
}

export async function safeApplyConsumption(
  stationId: string,
  nodeId: string,
  amountKg: number,
  meta: ApplyMeta,
): Promise<void> {
  try {
    emit(stationId, nodeId, await operatorBalanceService.consume(stationId, amountKg, { ...meta, nodeId }));
  } catch (err) {
    logger.error('operator balance consume xatosi (yutildi):', err);
  }
}

export async function safeApplyReverse(
  stationId: string,
  nodeId: string,
  amountKg: number,
  meta: ApplyMeta,
): Promise<void> {
  try {
    emit(stationId, nodeId, await operatorBalanceService.reverse(stationId, amountKg, { ...meta, nodeId }));
  } catch (err) {
    logger.error('operator balance reverse xatosi (yutildi):', err);
  }
}

export async function safeApplyEdit(
  stationId: string,
  nodeId: string,
  oldKg: number,
  newKg: number,
  meta: ApplyMeta,
): Promise<void> {
  try {
    emit(stationId, nodeId, await operatorBalanceService.applyEdit(stationId, oldKg, newKg, { ...meta, nodeId }));
  } catch (err) {
    logger.error('operator balance edit xatosi (yutildi):', err);
  }
}
