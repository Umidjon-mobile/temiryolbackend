import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

/**
 * Bruteforce himoyasi.
 * - attempts: noto'g'ri urinishlar soni
 * - lockedUntil: muddat tugagandan keyin auto-unlock
 */
const deviceLockSchema = new Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    attempts: { type: Number, default: 0 },
    lockedAt: { type: Number, default: null },
    lockedUntil: { type: Date, default: null }, // TTL
    lockedCode: { type: String, default: null }, // qaysi kod uchun lock
    isBlocked: { type: Boolean, default: false },
    lastAttemptAt: { type: Number, default: () => Date.now() },
  },
  {
    timestamps: true,
    collection: 'device_locks',
  },
);

// TTL: muddat tugaganda hujjat avtomatik o'chadi
deviceLockSchema.index({ lockedUntil: 1 }, { expireAfterSeconds: 0 });

export type DeviceLockDoc = HydratedDocument<InferSchemaType<typeof deviceLockSchema>>;
export const DeviceLockModel = model('DeviceLock', deviceLockSchema);
