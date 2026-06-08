import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

/**
 * Limits — bitta hujjat, singleton.
 * Developer/Admin tahrir qiladi, hamma o'qiydi.
 *
 * Strukturasi Firestore bilan moslashgan:
 *   korxonaLimits: { "korxonaNomi": limitPerDay }
 *   qurulishLimits: { "korxonaNomi": limit }
 *   korxonaList: { "stationId": [...], default: [...] }
 *   ...
 */
const limitsSettingsSchema = new Schema(
  {
    // Singleton _id
    _id: { type: String, default: 'singleton' },

    korxonaLimits: { type: Schema.Types.Mixed, default: {} },
    qurulishLimits: { type: Schema.Types.Mixed, default: {} },

    korxonaList: {
      type: Schema.Types.Mixed,
      default: { default: ['Predpriyatie'] },
    },
    qurulishKorxonaList: {
      type: Schema.Types.Mixed,
      default: { default: [] },
    },
    buyruqEgalariList: {
      type: Schema.Types.Mixed,
      default: { default: [] },
    },
    mashinaRaqamlari: {
      type: Schema.Types.Mixed,
      default: { default: [] },
    },
    obyektList: {
      type: Schema.Types.Mixed,
      default: { default: [] },
    },

    defaultLimit: { type: Number, default: 1000 }, // kg/sutka
    lastUpdated: { type: Number, default: () => Date.now() },
    updatedBy: { type: String, default: '' },
  },
  {
    timestamps: true,
    collection: 'limits_settings',
    _id: false,
  },
);

export type LimitsSettingsDoc = HydratedDocument<InferSchemaType<typeof limitsSettingsSchema>>;
export const LimitsSettingsModel = model('LimitsSettings', limitsSettingsSchema);
