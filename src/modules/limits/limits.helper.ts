import { LimitsSettingsModel, ApprovalModel } from '@/models';

const SINGLETON_ID = 'singleton';

export interface LimitsSettingsShape {
  korxonaLimits: Record<string, number>;
  qurulishLimits: Record<string, number>;
  korxonaList: Record<string, string[]>;
  qurulishKorxonaList: Record<string, string[]>;
  buyruqEgalariList: Record<string, string[]>;
  mashinaRaqamlari: Record<string, string[]>;
  obyektList: Record<string, string[]>;
  defaultLimit: number;
}

/** Singleton limits hujjatini olish (yo'q bo'lsa default bilan yaratiladi) */
export async function getLimitsSettings(): Promise<LimitsSettingsShape> {
  let doc = await LimitsSettingsModel.findById(SINGLETON_ID).lean();
  if (!doc) {
    const created = await LimitsSettingsModel.create({ _id: SINGLETON_ID });
    doc = created.toObject();
  }
  return {
    korxonaLimits: (doc.korxonaLimits as Record<string, number>) ?? {},
    qurulishLimits: (doc.qurulishLimits as Record<string, number>) ?? {},
    korxonaList: (doc.korxonaList as Record<string, string[]>) ?? { default: ['Predpriyatie'] },
    qurulishKorxonaList: (doc.qurulishKorxonaList as Record<string, string[]>) ?? { default: [] },
    buyruqEgalariList: (doc.buyruqEgalariList as Record<string, string[]>) ?? { default: [] },
    mashinaRaqamlari: (doc.mashinaRaqamlari as Record<string, string[]>) ?? { default: [] },
    obyektList: (doc.obyektList as Record<string, string[]>) ?? { default: [] },
    defaultLimit: doc.defaultLimit ?? 1000,
  };
}

/** Korxona limit tekshiruvi */
export interface LimitCheck {
  isOverLimit: boolean;
  limitKg: number;       // sutkalik limit (kg)
  excessKg: number;
}

export function checkKorxonaLimit(
  korxonaNomi: string,
  qancha: number,
  nechaSutkalik: number,
  settings: LimitsSettingsShape,
): LimitCheck {
  const limitPerDay = settings.korxonaLimits[korxonaNomi] ?? settings.defaultLimit;
  const totalLimit = limitPerDay * nechaSutkalik;
  const isOverLimit = qancha > totalLimit;
  return {
    isOverLimit,
    limitKg: limitPerDay,
    excessKg: isOverLimit ? +(qancha - totalLimit).toFixed(2) : 0,
  };
}

export function checkQurulishLimit(
  korxonaNomi: string,
  qancha: number,
  settings: LimitsSettingsShape,
): LimitCheck {
  const limit = settings.qurulishLimits[korxonaNomi] ?? settings.defaultLimit;
  const isOverLimit = qancha > limit;
  return {
    isOverLimit,
    limitKg: limit,
    excessKg: isOverLimit ? +(qancha - limit).toFixed(2) : 0,
  };
}

/**
 * Stansiyada hozir faol approval bormi (lokomotiv/korxona uchun)?
 * Lokomotiv: rusumi + lokomotivNumber, Korxona: korxonaNomi.
 */
export async function findActiveApproval(args: {
  stationId: string;
  requestType: 'lokomotiv' | 'korxona';
  seriya?: string;
  lokomotivNumber?: string;
  korxonaNomi?: string;
}): Promise<{ id: string; validUntil: number } | null> {
  const now = Date.now();
  const filter: Record<string, unknown> = {
    stationId: args.stationId,
    requestType: args.requestType,
    isActive: true,
    validUntil: { $gt: now },
  };
  if (args.requestType === 'lokomotiv') {
    filter.seriya = args.seriya;
    filter.lokomotivNumber = args.lokomotivNumber;
  } else {
    filter.korxonaNomi = args.korxonaNomi;
  }
  const doc = await ApprovalModel.findOne(filter).lean();
  return doc ? { id: String(doc._id), validUntil: doc.validUntil } : null;
}
