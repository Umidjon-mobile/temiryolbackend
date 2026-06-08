import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '@/config/env';
import type { JwtPayload } from '@/common/types';
import { ApiError } from '@/common/errors/api-error';

export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  const opts: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_SECRET, opts);
}

export function verifyToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Sessiya muddati tugagan', 'TOKEN_EXPIRED');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw ApiError.unauthorized('Yaroqsiz token', 'INVALID_TOKEN');
    }
    throw ApiError.unauthorized('Avtorizatsiya xatosi');
  }
}

export function getTokenExpiryMs(token: string): number | null {
  try {
    const decoded = jwt.decode(token) as { exp?: number } | null;
    if (decoded?.exp) return decoded.exp * 1000;
    return null;
  } catch {
    return null;
  }
}
