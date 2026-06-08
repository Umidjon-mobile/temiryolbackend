import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

/**
 * Bosh submission kolleksiyasi.
 *
 * Discriminator key — `category`. Har bir kategoriya o'zining maxsus maydonlarini
 * qo'shadi (LokomotivSubmission, KorxonaSubmission, ...).
 *
 * Eslatma: bu yerda ALL maydonlar emas — faqat hammaga umumiy bo'lganlari.
 * Kategoriya-spetsifik maydonlar discriminator schemada qo'shiladi.
 */
const submissionSchema = new Schema(
  {
    category: {
      type: String,
      enum: ['lokomotiv', 'korxona', 'qurulish', 'tamirlash'],
      required: true,
      index: true,
    },

    // Ishchi haqida
    staffCode: { type: String, required: true, index: true },
    staffName: { type: String, default: '' },

    // Zapravka / uzel
    stationId: { type: String, required: true, index: true },
    nodeId: { type: String, required: true, index: true },

    // Vaqt
    timestamp: { type: Number, required: true, index: true }, // millis
    timestampMs: { type: Number, required: true },             // duplicate (Firestore moslik uchun)
    dateISO: { type: String, required: true, index: true },    // "2026-06-04"
    year: { type: Number, required: true, index: true },
    month: { type: Number, required: true },
    day: { type: Number, required: true },

    // Limit metadata
    isOverLimit: { type: Boolean, default: false, index: true },
    limitKg: { type: Number, default: 0 },
    excessKg: { type: Number, default: 0 },

    // Mashina
    mashinadaYetkazildi: { type: Boolean, default: false },
    mashinaRaqami: { type: String, default: '' },

    // Audit
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Number, default: null },
    editedBy: { type: String, default: null },     // editor code
  },
  {
    timestamps: true,
    collection: 'submissions',
    discriminatorKey: 'category',
  },
);

// Indexlar: hisobot va filtrlash uchun
submissionSchema.index({ stationId: 1, category: 1, dateISO: 1 });
submissionSchema.index({ stationId: 1, timestamp: -1 });
submissionSchema.index({ category: 1, timestamp: -1 });
submissionSchema.index({ year: 1, stationId: 1, category: 1 });

export type SubmissionDoc = HydratedDocument<InferSchemaType<typeof submissionSchema>>;
export const SubmissionModel = model('Submission', submissionSchema);

// ─── Lokomotiv discriminator ──────────────────────────────────────
const lokomotivSchema = new Schema(
  {
    harakatTuri: {
      type: String,
      enum: ['yuk', 'yolovchi', 'manyovr', 'xojalik', 'ijara'],
      required: true,
    },
    rusumi: { type: String, required: true },
    lokomotivNumber: { type: String, required: true },

    // Ko'pchilik harakat turlari uchun
    poyezdNumber: { type: String, default: '' },
    ruxsatIndeksi: { type: String, default: '' },
    poyezdVazni: { type: Number, default: 0 },        // faqat yuk uchun majburiy

    qoldiq: { type: Number, default: 0 },
    qanchaBerildi: { type: Number, required: true },
    dizMasla: { type: Number, default: 0 },

    // Harakat turiga qarab
    stansiya: { type: String, default: '' },        // manyovr
    tashkilot: { type: String, default: '' },       // xojalik
    ijarachi: { type: String, default: '' },        // ijara
    zagranitsa: { type: String, default: '' },      // chet el

    jadval: { type: String, default: '' },
  },
  { _id: false },
);

export const LokomotivSubmissionModel = SubmissionModel.discriminator('lokomotiv', lokomotivSchema);

// ─── Korxona discriminator ────────────────────────────────────────
const korxonaSchema = new Schema(
  {
    korxonaNomi: { type: String, required: true, default: 'Predpriyatie' },
    poyezdNumber: { type: String, default: '' },
    ruxsatIndeksi: { type: String, default: '' },

    qancha: { type: Number, required: true },
    nechaSutkalik: { type: Number, required: true, default: 1 },

    // Limit oshsa majburiy
    buyruqNumber: { type: String, default: '' },
    kimTomonidan: { type: String, default: '' },
    buyruqVaqti: { type: Number, default: null },   // timestamp

    // Limit ma'lumoti (kompozit — yozish vaqtidagi snapshot)
    limit: { type: Number, default: 0 },
    oshiqMiqdor: { type: Number, default: 0 },

    // Approval bog'lanishi
    approvalId: { type: String, default: null },
  },
  { _id: false },
);

export const KorxonaSubmissionModel = SubmissionModel.discriminator('korxona', korxonaSchema);

// ─── Qurulish discriminator ───────────────────────────────────────
// Eslatma: spec da "hamma input ixtiyoriy bo'lishi mumkin, bo'sh raqamlar 0"
const qurulishSchema = new Schema(
  {
    // Asosiy
    korxonaNomi: { type: String, default: '' },
    texnikaSoni: { type: Number, default: 0 },
    obyekt: { type: String, default: '' },
    masulShaxs: { type: String, default: '' },
    lavozim: { type: String, default: '' },

    // Yoqilg'i
    qanchaOlindi: { type: Number, default: 0 },
    qanchaBerildi: { type: Number, default: 0 },    // alias
    dopLimit: { type: Number, default: 0 },

    // Lokomotiv-lik maydonlar (spec da bor edi)
    seriya: { type: String, default: '' },
    raqami: { type: String, default: '' },
    poyezdNumber: { type: String, default: '' },
    ruxsatIndeksi: { type: String, default: '' },
    poyezdVazni: { type: Number, default: 0 },
    qoldiq: { type: Number, default: 0 },

    // Limit oshsa
    buyruqNumber: { type: String, default: '' },
    kimTomonidan: { type: String, default: '' },
    buyruqVaqti: { type: Number, default: null },

    limit: { type: Number, default: 0 },
    oshiqMiqdor: { type: Number, default: 0 },

    approvalId: { type: String, default: null },
  },
  { _id: false },
);

export const QurulishSubmissionModel = SubmissionModel.discriminator('qurulish', qurulishSchema);

// ─── Tamirlash discriminator ──────────────────────────────────────
const tamirlashSchema = new Schema(
  {
    seriya: { type: String, required: true },
    raqami: { type: String, required: true },
    tamirlashTuri: {
      type: String,
      enum: ['katta', 'kichik', 'profilaktika'],
      required: true,
    },
    qanchaBerildi: { type: Number, required: true },
    dizMasla: { type: Number, default: 0 },
    masulShaxs: { type: String, required: true },
  },
  { _id: false },
);

export const TamirlashSubmissionModel = SubmissionModel.discriminator('tamirlash', tamirlashSchema);
