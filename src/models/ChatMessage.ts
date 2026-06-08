import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

/**
 * Chat messages — worker ↔ admin.
 * Asosan limit oshganda yoki ruxsat so'rashda ishlatiladi.
 *
 * Threadlar stationId bo'yicha ajraladi.
 */
const chatMessageSchema = new Schema(
  {
    // Joy
    stationId: { type: String, required: true, index: true },
    nodeId: { type: String, required: true },

    // Yuboruvchi
    senderCode: { type: String, required: true },
    senderName: { type: String, required: true },
    senderRole: { type: String, enum: ['worker', 'admin', 'developer'], required: true },

    // Matn
    text: { type: String, default: '' },
    messageType: {
      type: String,
      enum: ['text', 'approval_request', 'approval_granted', 'approval_rejected', 'system'],
      default: 'text',
      index: true,
    },

    // Approval bog'lanish
    approvalRequest: {
      requestType: { type: String, enum: ['lokomotiv', 'korxona'], default: null },
      seriya: { type: String, default: null },
      lokomotivNumber: { type: String, default: null },
      korxonaNomi: { type: String, default: null },
      requestKind: { type: String, default: null },
    },
    approvalId: { type: String, default: null }, // tasdiqlangan bo'lsa Approval._id

    // O'qildi
    readBy: { type: [String], default: [] }, // codes
    timestamp: { type: Number, default: () => Date.now(), index: true },
  },
  {
    timestamps: true,
    collection: 'chat_messages',
  },
);

chatMessageSchema.index({ stationId: 1, timestamp: -1 });

export type ChatMessageDoc = HydratedDocument<InferSchemaType<typeof chatMessageSchema>>;
export const ChatMessageModel = model('ChatMessage', chatMessageSchema);
