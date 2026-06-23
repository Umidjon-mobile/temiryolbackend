/**
 * Socket.io eventlar — barcha event nomlari shu yerda markazlashtirilgan.
 * Frontend ham shu nomlarni ishlatadi (shared types kelajakda).
 */

export const ServerEvents = {
  // Submissions
  SUBMISSION_CREATED: 'submission.created',
  SUBMISSION_UPDATED: 'submission.updated',
  SUBMISSION_DELETED: 'submission.deleted',

  // Approvals
  APPROVAL_GRANTED: 'approval.granted',
  APPROVAL_REJECTED: 'approval.rejected',

  // Chat
  CHAT_MESSAGE: 'chat.message',

  // Presence
  PRESENCE_UPDATED: 'presence.updated',

  // Admin notifications
  BLOCKED_CODES_UPDATED: 'blocked-codes.updated',
  RUSUMLAR_UPDATED: 'rusumlar.updated',
  LIMITS_UPDATED: 'limits.updated',

  // Operator balans
  OPERATOR_BALANCE_UPDATED: 'operator.balance.updated',
} as const;

export const ClientEvents = {
  // Worker joins his own station room
  JOIN_STATION: 'join:station',
  // Admin joins admin room (sees everything)
  JOIN_ADMIN: 'join:admin',
  // Heartbeat
  HEARTBEAT: 'heartbeat',
} as const;

/**
 * Room nomlari — channellar:
 *   station:<stationId>     — shu zapravka workerlari uchun
 *   admin                   — barcha adminlar
 *   user:<sessionId>        — bitta foydalanuvchi uchun maxsus
 */
export const Rooms = {
  station: (stationId: string) => `station:${stationId}`,
  node: (nodeId: string) => `node:${nodeId}`,
  admin: 'admin',
  user: (sessionId: string) => `user:${sessionId}`,
} as const;
