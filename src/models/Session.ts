import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

/**
 * Faol sessiyalar.
 * - Presence (online/offline) uchun lastSeen
 * - Logout uchun token invalidatsiya (token DB da bo'lmasa — invalidated)
 * - TTL: expiresAt avtomatik o'chiradi
 */
const sessionSchema = new Schema(
  {
    code: { type: String, required: true, index: true },
    role: {
      type: String,
      enum: ['worker', 'admin', 'developer'],
      required: true,
    },
    stationId: { type: String, default: null, index: true },
    nodeId: { type: String, default: null },
    displayName: { type: String, required: true },
    staffVaultFullName: { type: String, default: null },
    deviceId: { type: String, default: null, index: true },
    userAgent: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    lastSeen: { type: Number, default: () => Date.now(), index: true },
    expiresAt: { type: Date, required: true }, // TTL index
  },
  {
    timestamps: true,
    collection: 'sessions',
  },
);

// TTL: expiresAt yetganda hujjat avtomatik o'chiriladi
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type SessionDoc = HydratedDocument<InferSchemaType<typeof sessionSchema>>;
export const SessionModel = model('Session', sessionSchema);
