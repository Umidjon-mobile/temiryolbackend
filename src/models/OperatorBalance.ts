import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

/**
 * Operator zapravka balansi — har zapravka uchun bitta hujjat (singleton).
 *
 * Model:
 *   - balanceKg   — zapravkadagi joriy yoqilg'i zaxirasi (kg)
 *   - overlimitKg — zaxiradan oshib ketgan (qarz) miqdor (kg)
 *
 * Worker submission (berildi) → balansdan kamayadi; zaxiradan oshsa overlimit ortadi.
 * Operator qabul qiladi (receive) → avval overlimit yopiladi, qolgani balansga.
 *
 * Yangilanish CAS (compare-and-set) bilan — race condition'siz.
 * _id = stationId.
 */
const operatorBalanceSchema = new Schema(
  {
    _id: { type: String }, // stationId
    stationId: { type: String, required: true, index: true },
    nodeId: { type: String, default: '' },

    balanceKg: { type: Number, default: 0 },
    overlimitKg: { type: Number, default: 0 },

    // Running totals (audit / ko'rsatkich uchun)
    totalReceivedKg: { type: Number, default: 0 },
    totalConsumedKg: { type: Number, default: 0 },

    lastReceiveAt: { type: Number, default: null },
    lastConsumeAt: { type: Number, default: null },
  },
  {
    timestamps: true,
    collection: 'operator_balances',
    _id: false,
  },
);

export type OperatorBalanceDoc = HydratedDocument<InferSchemaType<typeof operatorBalanceSchema>>;
export const OperatorBalanceModel = model('OperatorBalance', operatorBalanceSchema);

// ─── Ledger — append-only tarix ───────────────────────────────────
/**
 * Operator balans tarixi (append-only).
 *   type: 'receive'  — operator yoqilg'i qabul qildi
 *         'consume'  — worker submission balansdan ayirdi
 *         'reverse'  — submission o'chirildi/kamaydi, yoqilg'i qaytdi
 *         'adjust'   — admin qo'lda tuzatdi
 */
const operatorLedgerSchema = new Schema(
  {
    stationId: { type: String, required: true, index: true },
    nodeId: { type: String, default: '' },
    type: {
      type: String,
      enum: ['receive', 'consume', 'reverse', 'adjust'],
      required: true,
    },
    amountKg: { type: Number, required: true },

    // Bog'lanish (consume/reverse uchun)
    submissionId: { type: String, default: null },
    category: { type: String, default: null },

    // Operatsiyadan keyingi holat
    balanceAfter: { type: Number, default: 0 },
    overlimitAfter: { type: Number, default: 0 },

    // Kim
    by: { type: String, default: '' },
    byName: { type: String, default: '' },
    note: { type: String, default: '' },

    timestamp: { type: Number, required: true, index: true },
  },
  {
    timestamps: true,
    collection: 'operator_ledger',
  },
);

operatorLedgerSchema.index({ stationId: 1, timestamp: -1 });

export type OperatorLedgerDoc = HydratedDocument<InferSchemaType<typeof operatorLedgerSchema>>;
export const OperatorLedgerModel = model('OperatorLedger', operatorLedgerSchema);
