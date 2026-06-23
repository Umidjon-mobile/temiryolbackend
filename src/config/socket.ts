import { Server as IOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyToken } from '@/common/utils/jwt';
import { SessionModel } from '@/models';
import { env } from './env';
import { logger } from '@/common/utils/logger';
import { ClientEvents, Rooms, ServerEvents } from '@/events';

let io: IOServer | null = null;

export function initSocket(httpServer: HttpServer): IOServer {
  io = new IOServer(httpServer, {
    cors: {
      origin: env.corsOrigins,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Auth middleware (handshake da JWT)
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers.authorization?.toString().replace(/^Bearer\s+/i, '');

      if (!token) {
        return next(new Error('Token kerak'));
      }

      const payload = verifyToken(String(token));

      // Session DB da bormi?
      const session = await SessionModel.findById(payload.sub).lean();
      if (!session) {
        return next(new Error('Sessiya topilmadi'));
      }

      socket.data.user = payload;
      socket.data.sessionId = payload.sub;
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as ReturnType<typeof verifyToken>;
    logger.debug(`Socket ulanish: ${user.code} (${user.role})`);

    // O'z user room iga qo'shilish
    socket.join(Rooms.user(socket.data.sessionId));

    // Avtomatik rooms (rolga qarab)
    if (user.role === 'admin' || user.role === 'developer') {
      socket.join(Rooms.admin);
    }
    if (user.role === 'worker' && user.stationId) {
      socket.join(Rooms.station(user.stationId));
      if (user.nodeId) socket.join(Rooms.node(user.nodeId));
    }

    // Manual room qo'shish (alohida) — kelajakda overrideda foydali
    socket.on(ClientEvents.JOIN_STATION, (stationId: string) => {
      if (user.role === 'admin' || user.role === 'developer') {
        socket.join(Rooms.station(stationId));
      }
    });

    socket.on(ClientEvents.JOIN_ADMIN, () => {
      if (user.role === 'admin' || user.role === 'developer') {
        socket.join(Rooms.admin);
      }
    });

    // Heartbeat
    socket.on(ClientEvents.HEARTBEAT, () => {
      SessionModel.updateOne(
        { _id: socket.data.sessionId },
        { $set: { lastSeen: Date.now() } },
      )
        .exec()
        .catch(() => undefined);
    });

    socket.on('disconnect', (reason) => {
      logger.debug(`Socket uzildi: ${user.code} (${reason})`);
    });
  });

  logger.info('✓ Socket.io ishga tushdi');
  return io;
}

export function getIO(): IOServer {
  if (!io) {
    throw new Error('Socket.io initSocket() chaqirilmagan');
  }
  return io;
}

/** Helper: ma'lum room ga event yuborish */
export function emitToRoom(room: string, event: string, payload: unknown): void {
  getIO().to(room).emit(event, payload);
}

/** Submission yangilanganda barcha kerakli room larga e'lon */
export function broadcastSubmissionChange(
  type: 'created' | 'updated' | 'deleted',
  data: { stationId: string; nodeId?: string | null; [k: string]: unknown },
): void {
  const eventName =
    type === 'created'
      ? ServerEvents.SUBMISSION_CREATED
      : type === 'updated'
        ? ServerEvents.SUBMISSION_UPDATED
        : ServerEvents.SUBMISSION_DELETED;

  const io = getIO();
  io.to(Rooms.station(data.stationId)).emit(eventName, data);
  io.to(Rooms.admin).emit(eventName, data);
  if (data.nodeId) {
    io.to(Rooms.node(data.nodeId)).emit(eventName, data);
  }
}

/** Operator balansi o'zgarganda admin + zapravka room larga e'lon */
export function broadcastBalanceChange(
  stationId: string,
  nodeId: string | null | undefined,
  payload: Record<string, unknown>,
): void {
  if (!io) return; // socket hali ishga tushmagan bo'lishi mumkin (masalan import)
  const event = ServerEvents.OPERATOR_BALANCE_UPDATED;
  io.to(Rooms.station(stationId)).emit(event, payload);
  io.to(Rooms.admin).emit(event, payload);
  if (nodeId) io.to(Rooms.node(nodeId)).emit(event, payload);
}
