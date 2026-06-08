import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { ApiError } from '@/common/errors/api-error';
import { logger } from '@/common/utils/logger';
import { env } from '@/config/env';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Zod validatsiya xatosi
  if (err instanceof ZodError) {
    return res.status(400).json({
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'Kiritilgan ma\'lumotlar noto\'g\'ri',
      details: err.flatten().fieldErrors,
    });
  }

  // Mongoose validation
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({
      ok: false,
      code: 'DB_VALIDATION_ERROR',
      message: 'Ma\'lumotlar bazasi validatsiya xatosi',
      details: Object.fromEntries(
        Object.entries(err.errors).map(([k, v]) => [k, v.message]),
      ),
    });
  }

  // Mongo duplicate key
  if ((err as { code?: number })?.code === 11000) {
    const dupField = Object.keys((err as { keyValue?: object }).keyValue ?? {})[0] ?? 'maydon';
    return res.status(409).json({
      ok: false,
      code: 'DUPLICATE_KEY',
      message: `Bu ${dupField} allaqachon mavjud`,
    });
  }

  // Custom ApiError
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      ok: false,
      code: err.code,
      message: err.message,
      details: err.details,
    });
  }

  // Boshqa har qanday xato
  const message = err instanceof Error ? err.message : 'Server xatosi';
  logger.error(`Unhandled error on ${req.method} ${req.path}:`, err);

  return res.status(500).json({
    ok: false,
    code: 'INTERNAL_ERROR',
    message: env.isProduction ? 'Server xatosi yuz berdi' : message,
    ...(env.isProduction ? {} : { stack: (err as Error)?.stack }),
  });
}

export function notFoundMiddleware(req: Request, res: Response) {
  res.status(404).json({
    ok: false,
    code: 'ROUTE_NOT_FOUND',
    message: `${req.method} ${req.path} mavjud emas`,
  });
}
