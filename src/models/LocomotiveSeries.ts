import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

/**
 * Lokomotiv rusumlari (seriyalar).
 * Admin tomonidan boshqariladi.
 * Worker bu ro'yxatdan tanlaydi.
 */
const locomotiveSeriesSchema = new Schema(
  {
    seriya: { type: String, required: true, unique: true, trim: true, uppercase: true },
    description: { type: String, default: '' },
    fuelTankCapacityKg: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    createdBy: { type: String, default: '' },
  },
  {
    timestamps: true,
    collection: 'locomotive_series',
  },
);

locomotiveSeriesSchema.index({ seriya: 1 });

export type LocomotiveSeriesDoc = HydratedDocument<InferSchemaType<typeof locomotiveSeriesSchema>>;
export const LocomotiveSeriesModel = model('LocomotiveSeries', locomotiveSeriesSchema);
