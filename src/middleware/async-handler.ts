import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Async route handler wrapper. try/catch yozmasdan
 * async funksiyalardagi xatolarni error middleware ga yo'naltiradi.
 */
export function asyncHandler<
  TReq extends Request = Request,
  TRes extends Response = Response,
>(fn: (req: TReq, res: TRes, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as TReq, res as TRes, next)).catch(next);
  };
}
