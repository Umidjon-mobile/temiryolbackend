import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '@/common/utils/jwt';
import { ApiError } from '@/common/errors/api-error';
import { SessionModel } from '@/models';
import type { Role } from '@/common/types';

/**
 * JWT verify + session existsmi tekshirish.
 * req.user ga payload yoziladi.
 */
export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Bearer token kerak');
    }
    const token = header.slice(7).trim();
    if (!token) throw ApiError.unauthorized('Token bo\'sh');

    const payload = verifyToken(token);

    // Session DB da bormi? (logout qilingan tokenlar bu yerda yo'q)
    const session = await SessionModel.findById(payload.sub).lean();
    if (!session) {
      throw ApiError.unauthorized('Sessiya topilmadi yoki bekor qilingan', 'SESSION_NOT_FOUND');
    }

    req.user = payload;
    req.sessionId = payload.sub;

    // Heartbeat (eng yangi lastSeen)
    SessionModel.updateOne({ _id: payload.sub }, { $set: { lastSeen: Date.now() } })
      .exec()
      .catch(() => undefined);

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Faqat berilgan rollar uchun ruxsat beradi.
 *   router.get('/admin/...', authMiddleware, requireRole('admin', 'developer'), ...)
 */
export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }
    if (!allowed.includes(req.user.role)) {
      return next(ApiError.forbidden(`Ushbu amal uchun ${allowed.join('/')} roli kerak`, 'INSUFFICIENT_ROLE'));
    }
    next();
  };
}

/**
 * Worker faqat o'z stationId uchun action qila olishini ta'minlaydi.
 * Admin va developer uchun cheklov yo'q.
 */
export function requireSameStation(stationIdField = 'stationId') {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (req.user.role !== 'worker') return next();

    const target =
      (req.body && req.body[stationIdField]) ||
      (req.params && req.params[stationIdField]) ||
      (req.query && req.query[stationIdField]);

    if (!req.user.stationId) {
      return next(ApiError.forbidden('Sizga zapravka biriktirilmagan'));
    }

    if (target && target !== req.user.stationId) {
      return next(
        ApiError.forbidden('Siz faqat o\'z zapravkangiz uchun amalni bajarishingiz mumkin', 'STATION_MISMATCH'),
      );
    }
    next();
  };
}
