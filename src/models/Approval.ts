import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

/**
 * Limit oshib ketganda admin tomonidan beriladigan ruxsatnoma.
 * Chat orqali so'rov yuboriladi, admin approve qiladi.
 */
const approvalSchema = new Schema(
  {
    messageId: { type: String, default: null }, // chat message bog'lanishi (ixtiyoriy)

    requestType: {
      type: String,
      enum: ['lokomotiv', 'korxona'],
      required: true,
    },

    // Lokomotiv uchun
    seriya: { type: String, default: null },
    lokomotivNumber: { type: String, default: null },
    requestKind: {
      type: String,
      enum: ['tashqari', 'oldinroq', null],
      default: null,
    },

    // Korxona uchun
    korxonaNomi: { type: String, default: null },

    // Joy
    stationId: { type: String, required: true, index: true },
    nodeId: { type: String, required: true },

    // Admin
    approvedBy: { type: String, required: true },     // admin code
    approvedByName: { type: String, required: true },
    approvedAt: { type: Number, default: () => Date.now() },

    // Amal qilish muddati
    sutkalikLimit: { type: Number, required: true }, // necha sutka amal qiladi
    validUntil: { type: Number, required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,
    collection: 'approvals',
  },
);

approvalSchema.index({ stationId: 1, isActive: 1, validUntil: 1 });

export type ApprovalDoc = HydratedDocument<InferSchemaType<typeof approvalSchema>>;
export const ApprovalModel = model('Approval', approvalSchema);
