import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

/**
 * Daily summaries — kunlik aggregate.
 * Har submission yozilganda increment qilinadi (transaction ichida).
 * Edit/delete bo'lganda delta orqali yangilanadi.
 *
 * Key: (dateISO, stationId, category)
 */
const dailySummarySchema = new Schema(
  {
    dateISO: { type: String, required: true, index: true },
    stationId: { type: String, required: true, index: true },
    nodeId: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: ['lokomotiv', 'korxona', 'qurulish', 'tamirlash'],
      required: true,
    },

    // Lokomotiv uchun harakat turi bo'yicha pastki kategoriya (optional)
    harakatTuri: { type: String, default: null }, // yuk/yolovchi/... yoki null

    totalFuelKg: { type: Number, default: 0 },
    totalMaslaKg: { type: Number, default: 0 },
    recordCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'daily_summaries',
  },
);

dailySummarySchema.index(
  { dateISO: 1, stationId: 1, category: 1, harakatTuri: 1 },
  { unique: true },
);

export type DailySummaryDoc = HydratedDocument<InferSchemaType<typeof dailySummarySchema>>;
export const DailySummaryModel = model('DailySummary', dailySummarySchema);

// ─── Yearly Summary ──────────────────────────────────────────────
const yearlySummarySchema = new Schema(
  {
    year: { type: Number, required: true, index: true },
    stationId: { type: String, required: true, index: true },
    nodeId: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: ['lokomotiv', 'korxona', 'qurulish', 'tamirlash'],
      required: true,
    },
    harakatTuri: { type: String, default: null },

    totalFuelKg: { type: Number, default: 0 },
    totalMaslaKg: { type: Number, default: 0 },
    recordCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'yearly_summaries',
  },
);

yearlySummarySchema.index(
  { year: 1, stationId: 1, category: 1, harakatTuri: 1 },
  { unique: true },
);

export type YearlySummaryDoc = HydratedDocument<InferSchemaType<typeof yearlySummarySchema>>;
export const YearlySummaryModel = model('YearlySummary', yearlySummarySchema);
