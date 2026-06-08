/**
 * Tizim ichidagi umumiy tiplar.
 */

export type Role = 'worker' | 'admin' | 'developer';

export type CodeType = 'main' | 'reserve' | 'admin' | 'developer';

export type Category = 'lokomotiv' | 'korxona' | 'qurulish' | 'tamirlash';

export type HarakatTuri = 'yuk' | 'yolovchi' | 'manyovr' | 'xojalik' | 'ijara';

export type TamirlashTuri = 'katta' | 'kichik' | 'profilaktika';

/** JWT payload */
export interface JwtPayload {
  sub: string;          // session ID
  code: string;
  role: Role;
  stationId: string | null;
  nodeId: string | null;
  displayName: string;
  iat?: number;
  exp?: number;
}

/** Authenticated request — auth middleware to'ldiradi */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
      sessionId?: string;
    }
  }
}

export {};
