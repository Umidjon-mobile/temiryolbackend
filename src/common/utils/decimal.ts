/**
 * Decimal yordamchilar.
 * Inputdagi "12,5" ham, "12.5" ham 12.5 ga aylanadi.
 */

export function toDecimal(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;

  const cleaned = value.trim().replace(',', '.').replace(/[^\d.\-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Kg ni 2 ta o'nlik xona bilan saqlash */
export function roundKg(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Schema preparer — decimal maydonlarni normallashtirish */
export function normalizeDecimalFields<T extends Record<string, unknown>>(
  data: T,
  fields: (keyof T)[],
): T {
  const result = { ...data };
  for (const field of fields) {
    if (field in result) {
      result[field] = roundKg(toDecimal(result[field])) as T[keyof T];
    }
  }
  return result;
}
