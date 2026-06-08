import dayjs from 'dayjs';
import {
  UserModel,
  StaffModel,
  SessionModel,
  BlockedCodeModel,
  DeviceLockModel,
  AuditLogModel,
} from '@/models';
import { ApiError } from '@/common/errors/api-error';
import { signToken } from '@/common/utils/jwt';
import { env } from '@/config/env';
import { logger } from '@/common/utils/logger';
import type { JwtPayload, Role } from '@/common/types';

export interface LoginInput {
  code: string;
  deviceId: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface LoginResult {
  token: string;
  session: {
    code: string;
    role: Role;
    stationId: string | null;
    nodeId: string | null;
    displayName: string;
    staffVaultFullName: string | null;
    expiresAt: number;
  };
}

class AuthService {
  /**
   * Asosiy login.
   *
   * Bosqichlar:
   *   1. blocked_codes — kod taqiqlanganmi?
   *   2. device_locks — qurilma vaqtincha bloklangamni?
   *   3. users — bunday kod bormi va isActive?
   *   4. staff vault — fullName olish (worker uchun)
   *   5. JWT yaratish + session yozish
   *   6. attempts ni 0 ga tushirish
   */
  async login(input: LoginInput): Promise<LoginResult> {
    const { code, deviceId, userAgent, ipAddress } = input;

    // 1. Block tekshirish
    const blocked = await BlockedCodeModel.findOne({ code }).lean();
    if (blocked) {
      throw ApiError.forbidden(
        `Bu kod tizimga kirish uchun bloklangan${blocked.note ? `: ${blocked.note}` : ''}`,
        'CODE_BLOCKED',
      );
    }

    // 2. Device lock tekshirish
    const lock = await DeviceLockModel.findOne({ deviceId });
    if (lock?.isBlocked && lock.lockedUntil && lock.lockedUntil > new Date()) {
      const remainMin = Math.ceil(
        (lock.lockedUntil.getTime() - Date.now()) / 60_000,
      );
      throw ApiError.tooMany(
        `Qurilma ${remainMin} daqiqaga vaqtincha bloklangan. Keyinroq urinib ko'ring.`,
        'DEVICE_LOCKED',
      );
    }

    // 3. Foydalanuvchini topish
    const user = await UserModel.findOne({ code, isActive: true }).lean();
    if (!user) {
      await this.registerFailedAttempt(deviceId, code);
      throw ApiError.unauthorized('Kod noto\'g\'ri yoki faol emas', 'INVALID_CODE');
    }

    // 4. Staff fullName (worker uchun)
    let staffVaultFullName: string | null = null;
    if (user.role === 'worker') {
      const staff = await StaffModel.findOne({ tabelNumber: code }).lean();
      if (staff) {
        staffVaultFullName = staff.fullName;
      }
    }

    // 5. Session yaratish
    const expiresAt = dayjs().add(7, 'day').toDate();
    const session = await SessionModel.create({
      code: user.code,
      role: user.role,
      stationId: user.stationId,
      nodeId: user.nodeId,
      displayName: user.displayName,
      staffVaultFullName,
      deviceId,
      userAgent: userAgent ?? '',
      ipAddress: ipAddress ?? '',
      lastSeen: Date.now(),
      expiresAt,
    });

    // 6. JWT
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: String(session._id),
      code: user.code,
      role: user.role,
      stationId: user.stationId ?? null,
      nodeId: user.nodeId ?? null,
      displayName: user.displayName,
    };
    const token = signToken(payload);

    // 7. Device lock ni tozalash
    if (lock) {
      await DeviceLockModel.updateOne(
        { deviceId },
        {
          $set: {
            attempts: 0,
            isBlocked: false,
            lockedAt: null,
            lockedUntil: null,
            lockedCode: null,
          },
        },
      );
    }

    // 8. Audit
    await AuditLogModel.create({
      userId: user.code,
      userName: staffVaultFullName ?? user.displayName,
      userRole: user.role,
      action: 'login',
      entityType: 'session',
      entityId: String(session._id),
      ipAddress: ipAddress ?? '',
    });

    logger.info(
      `Login: ${user.code} (${user.role}) → ${user.stationId ?? '—'} | device=${deviceId.slice(0, 8)}`,
    );

    return {
      token,
      session: {
        code: user.code,
        role: user.role,
        stationId: user.stationId ?? null,
        nodeId: user.nodeId ?? null,
        displayName: user.displayName,
        staffVaultFullName,
        expiresAt: expiresAt.getTime(),
      },
    };
  }

  async logout(sessionId: string, code: string): Promise<void> {
    await SessionModel.findByIdAndDelete(sessionId);
    await AuditLogModel.create({
      userId: code,
      action: 'logout',
      entityType: 'session',
      entityId: sessionId,
    });
  }

  async me(sessionId: string) {
    const session = await SessionModel.findById(sessionId).lean();
    if (!session) {
      throw ApiError.unauthorized('Sessiya topilmadi yoki muddati tugagan', 'SESSION_EXPIRED');
    }
    return {
      sessionId: String(session._id),
      code: session.code,
      role: session.role,
      stationId: session.stationId,
      nodeId: session.nodeId,
      displayName: session.displayName,
      staffVaultFullName: session.staffVaultFullName,
      lastSeen: session.lastSeen,
      expiresAt: session.expiresAt instanceof Date ? session.expiresAt.getTime() : Number(session.expiresAt),
    };
  }

  /** Heartbeat — onlayn jadval uchun */
  async heartbeat(sessionId: string): Promise<void> {
    await SessionModel.updateOne(
      { _id: sessionId },
      { $set: { lastSeen: Date.now() } },
    );
  }

  /**
   * Noto'g'ri kirish urinishi.
   * Max urinishdan oshsa qurilma N daqiqaga bloklanadi.
   */
  private async registerFailedAttempt(deviceId: string, code: string): Promise<void> {
    const lock = await DeviceLockModel.findOne({ deviceId });
    const attempts = (lock?.attempts ?? 0) + 1;
    const shouldBlock = attempts >= env.MAX_LOGIN_ATTEMPTS;

    const update: Record<string, unknown> = {
      attempts,
      lastAttemptAt: Date.now(),
      lockedCode: code,
    };

    if (shouldBlock) {
      update.isBlocked = true;
      update.lockedAt = Date.now();
      update.lockedUntil = dayjs().add(env.LOGIN_LOCK_MINUTES, 'minute').toDate();
    }

    await DeviceLockModel.updateOne(
      { deviceId },
      { $set: update },
      { upsert: true },
    );
  }
}

export const authService = new AuthService();
