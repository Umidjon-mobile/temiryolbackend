import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

/**
 * ERJU Y.PDF uchun fuel records.
 * Har submissiondan keyin avtomatik yoziladi (lokomotiv, korxona, qurulish, tamirlash).
 *
 * Bog'lanish: submissionId orqali asosiy submission ga qaytadi (delete cascade uchun).
 */
const fuelRecordSchema = new Schema(
  {
    // Bog'lanish
    submissionId: { type: String, required: true, index: true },
    category: {
      type: String,
      enum: ['lokomotiv', 'korxona', 'qurulish', 'tamirlash'],
      required: true,
    },

    // Sana / vaqt
    dateISO: { type: String, required: true, index: true },
    year: { type: Number, required: true, index: true },
    time: { type: String, default: '' },          // "HH:mm"
    timestamp: { type: Number, required: true, index: true },

    // Joy
    supplyPoint: { type: String, default: '' },   // zapravka nomi
    stationId: { type: String, required: true, index: true },
    locCode: { type: String, default: '' },       // stationId alias (Firestore moslik)
    nodeId: { type: String, required: true },

    // Xodim
    staffCode: { type: String, default: '' },
    staffName: { type: String, default: '' },

    // Harakat
    moveType: { type: String, required: true },   // yuk/yolovchi/manyovr/xojalik/ijara/tamirlash/korxona/qurulish
    locoSeries: { type: String, default: '' },    // rusumi yoki seriya
    locoCode: { type: String, default: '' },      // lokomotivNumber yoki raqami
    locoNumber: { type: String, default: '' },    // poyezdNumber / stansiya / tashkilot
    trainIndex: { type: String, default: '' },    // ruxsatIndeksi
    weight: { type: String, default: '' },        // poyezdVazni

    // Yoqilg'i (string ko'rinishida — Firestore bilan moslashtirish)
    balanceBefore: { type: String, default: '' }, // qoldiq
    fuelAmount: { type: String, required: true }, // qanchaBerildi/qancha/qanchaOlindi
    maslaAmount: { type: String, default: '' },   // dizMasla

    // Numeric versiyalari (hisobot uchun)
    fuelAmountKg: { type: Number, required: true },
    maslaAmountKg: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: 'fuel_records',
  },
);

fuelRecordSchema.index({ stationId: 1, dateISO: 1 });
fuelRecordSchema.index({ stationId: 1, year: 1, moveType: 1 });
fuelRecordSchema.index({ category: 1, timestamp: -1 });

export type FuelRecordDoc = HydratedDocument<InferSchemaType<typeof fuelRecordSchema>>;
export const FuelRecordModel = model('FuelRecord', fuelRecordSchema);
