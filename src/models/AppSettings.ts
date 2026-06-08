import mongoose, { Schema, type Model } from 'mongoose';

export interface AppSettingsDoc {
  _id: string;
  value: unknown;
  updatedAt: number;
  updatedBy: string;
}

/**
 * Generic key/value store frontend tomonidan murakkab settings hujjatlarini saqlash uchun.
 * Misol kalitlari:
 *  - lokomotivRusumlar — { items: [...], hiddenStaticValues: [...] }
 *  - variants:<stationId> — { fieldKey1: [v1, v2], fieldKey2: [v3] }
 *  - questions:<category> — [...]
 */
const AppSettingsSchema = new Schema<AppSettingsDoc>(
  {
    _id: { type: String, required: true }, // key
    value: { type: Schema.Types.Mixed, default: {} },
    updatedAt: { type: Number, default: Date.now },
    updatedBy: { type: String, default: '' },
  },
  { _id: false, timestamps: false },
);

AppSettingsSchema.index({ updatedAt: -1 });

export const AppSettingsModel: Model<AppSettingsDoc> =
  (mongoose.models.AppSettings as Model<AppSettingsDoc>) ||
  mongoose.model<AppSettingsDoc>('AppSettings', AppSettingsSchema, 'app_settings');
