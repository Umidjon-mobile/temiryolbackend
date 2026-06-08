/**
 * API xatolari uchun standart class. Error middleware bu instancelarni
 * to'g'ri statusCode bilan formatlaydi.
 */

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, code = 'API_ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message: string, code = 'BAD_REQUEST', details?: unknown): ApiError {
    return new ApiError(400, message, code, details);
  }

  static unauthorized(message = 'Avtorizatsiya talab qilinadi', code = 'UNAUTHORIZED'): ApiError {
    return new ApiError(401, message, code);
  }

  static forbidden(message = 'Ruxsat etilmagan', code = 'FORBIDDEN'): ApiError {
    return new ApiError(403, message, code);
  }

  static notFound(message = 'Topilmadi', code = 'NOT_FOUND'): ApiError {
    return new ApiError(404, message, code);
  }

  static conflict(message: string, code = 'CONFLICT'): ApiError {
    return new ApiError(409, message, code);
  }

  static tooMany(message = 'Juda ko\'p urinish', code = 'TOO_MANY_REQUESTS'): ApiError {
    return new ApiError(429, message, code);
  }

  static internal(message = 'Server xatosi', code = 'INTERNAL_ERROR'): ApiError {
    return new ApiError(500, message, code);
  }
}
