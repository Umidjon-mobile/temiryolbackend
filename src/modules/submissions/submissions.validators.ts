import { z } from 'zod';

/**
 * Ixtiyoriy matn — null/undefined ni bir xil ko'radi.
 * Eski frontend bo'sh maydonlarni `null` qilib yuborishi mumkin; strict
 * `z.string()` esa null ni rad etib, butun submissionni "noto'g'ri" qiladi.
 * Shu sabab null/undefined → default qiymatga aylantiriladi.
 */
const optionalText = (def = '') =>
  z.preprocess((v) => (v == null ? undefined : v), z.string().optional().default(def));

/** Decimal string ("12,5" yoki "12.5") yoki number — null/bo'sh ham qabul */
const decimalInput = z.preprocess(
  (v) => (v == null || v === '' ? undefined : v),
  z.union([z.string(), z.number()]).optional(),
);

/** Raqam yoki matn (zagranitsa kabi) — null/bo'sh ham qabul */
const numberOrText = z.preprocess(
  (v) => (v == null || v === '' ? undefined : v),
  z.union([z.string(), z.number()]).optional(),
);

/** ISO sana — frontenddan test rejimida kelishi mumkin */
const dateISOSchema = z.preprocess(
  (v) => (v == null || v === '' ? undefined : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
);

// ─── Lokomotiv ────────────────────────────────────────────────────
export const lokomotivCreateSchema = z.object({
  stationId: z.string().min(1),
  nodeId: z.string().min(1),

  harakatTuri: z.enum(['yuk', 'yolovchi', 'manyovr', 'xojalik', 'ijara']),
  rusumi: z.string().min(1),
  lokomotivNumber: z.string().min(1),

  poyezdNumber: optionalText(),
  ruxsatIndeksi: optionalText(),
  poyezdVazni: decimalInput,

  qoldiq: decimalInput,
  qanchaBerildi: decimalInput,
  dizMasla: decimalInput,

  stansiya: optionalText(),
  tashkilot: optionalText(),
  ijarachi: optionalText(),
  // Frontend zagranitsa'ni raqam yoki matn qilib yuborishi mumkin
  zagranitsa: numberOrText,
  jadval: optionalText(),

  mashinadaYetkazildi: z.preprocess((v) => v ?? false, z.boolean()).default(false),
  mashinaRaqami: optionalText(),

  reportDateISO: dateISOSchema, // test rejim uchun
});

// ─── Korxona ──────────────────────────────────────────────────────
export const korxonaCreateSchema = z.object({
  stationId: z.string().min(1),
  nodeId: z.string().min(1),

  korxonaNomi: optionalText('Predpriyatie'),
  poyezdNumber: optionalText(),
  ruxsatIndeksi: optionalText(),

  qancha: decimalInput,
  nechaSutkalik: z.preprocess((v) => (v == null || v === '' ? undefined : v), z.union([z.string(), z.number()]).optional().default(1)),

  buyruqNumber: optionalText(),
  kimTomonidan: optionalText(),
  buyruqVaqti: z.preprocess((v) => (v == null ? undefined : v), z.number().optional()),

  mashinadaYetkazildi: z.preprocess((v) => v ?? false, z.boolean()).default(false),
  mashinaRaqami: optionalText(),

  reportDateISO: dateISOSchema,
});

// ─── Qurilish ─────────────────────────────────────────────────────
// Hamma maydon ixtiyoriy, faqat zapravka bog'lanishi majburiy
export const qurulishCreateSchema = z.object({
  stationId: z.string().min(1),
  nodeId: z.string().min(1),

  korxonaNomi: optionalText(),
  texnikaSoni: numberOrText,
  obyekt: optionalText(),
  masulShaxs: optionalText(),
  lavozim: optionalText(),

  qanchaOlindi: decimalInput,
  qanchaBerildi: decimalInput,
  dopLimit: decimalInput,

  seriya: optionalText(),
  raqami: optionalText(),
  poyezdNumber: optionalText(),
  ruxsatIndeksi: optionalText(),
  poyezdVazni: decimalInput,
  qoldiq: decimalInput,

  buyruqNumber: optionalText(),
  kimTomonidan: optionalText(),
  buyruqVaqti: z.preprocess((v) => (v == null ? undefined : v), z.number().optional()),

  mashinadaYetkazildi: z.preprocess((v) => v ?? false, z.boolean()).default(false),
  mashinaRaqami: optionalText(),

  reportDateISO: dateISOSchema,
});

// ─── Tamirlash ────────────────────────────────────────────────────
export const tamirlashCreateSchema = z.object({
  stationId: z.string().min(1),
  nodeId: z.string().min(1),

  seriya: z.string().min(1),
  raqami: z.string().min(1),
  tamirlashTuri: z.enum(['katta', 'kichik', 'profilaktika']),
  qanchaBerildi: decimalInput,
  dizMasla: decimalInput,
  masulShaxs: z.string().min(1),

  mashinadaYetkazildi: z.preprocess((v) => v ?? false, z.boolean()).default(false),
  mashinaRaqami: optionalText(),

  reportDateISO: dateISOSchema,
});

// ─── Universal patch (admin va worker uchun bitta schema) ─────────
export const submissionPatchSchema = z.record(z.unknown());

// ─── Query (list) ─────────────────────────────────────────────────
export const submissionListQuerySchema = z.object({
  stationId: z.string().optional(),
  category: z.enum(['lokomotiv', 'korxona', 'qurulish', 'tamirlash', 'all']).default('all'),
  dateISO: dateISOSchema,
  startDate: dateISOSchema,
  endDate: dateISOSchema,
  limit: z.coerce.number().int().min(1).max(10000).default(100),
  skip: z.coerce.number().int().min(0).default(0),
});

export type LokomotivCreateInput = z.infer<typeof lokomotivCreateSchema>;
export type KorxonaCreateInput = z.infer<typeof korxonaCreateSchema>;
export type QurulishCreateInput = z.infer<typeof qurulishCreateSchema>;
export type TamirlashCreateInput = z.infer<typeof tamirlashCreateSchema>;
export type SubmissionListQuery = z.infer<typeof submissionListQuerySchema>;
