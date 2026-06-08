import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose';

const auditLogSchema = new Schema(
  {
    userId: { type: String, default: '' },         // code yoki sessionId
    userName: { type: String, default: '' },
    userRole: { type: String, default: '' },
    action: {
      type: String,
      enum: ['create', 'update', 'delete', 'login', 'logout', 'block', 'unblock'],
      required: true,
    },
    entityType: { type: String, required: true, index: true }, // 'submission', 'code', 'staff', ...
    entityId: { type: String, default: '' },
    changes: { type: Schema.Types.Mixed, default: {} },
    timestamp: { type: Number, default: () => Date.now(), index: true },
    ipAddress: { type: String, default: '' },
  },
  {
    timestamps: false,
    collection: 'audit_logs',
  },
);

auditLogSchema.index({ entityType: 1, timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });

export type AuditLogDoc = HydratedDocument<InferSchemaType<typeof auditLogSchema>>;
export const AuditLogModel = model('AuditLog', auditLogSchema);
