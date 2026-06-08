import { Request, Response } from 'express';
import { authService } from './auth.service';
import { loginCodeSchema } from './auth.validators';
import { ApiError } from '@/common/errors/api-error';

class AuthController {
  async loginCode(req: Request, res: Response) {
    const { code, deviceId } = loginCodeSchema.parse(req.body);

    const result = await authService.login({
      code,
      deviceId,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });

    res.json({ ok: true, ...result });
  }

  async logout(req: Request, res: Response) {
    if (!req.user?.sub) {
      throw ApiError.unauthorized();
    }
    await authService.logout(req.user.sub, req.user.code);
    res.json({ ok: true });
  }

  async me(req: Request, res: Response) {
    if (!req.user?.sub) {
      throw ApiError.unauthorized();
    }
    const me = await authService.me(req.user.sub);
    res.json({ ok: true, me });
  }

  async heartbeat(req: Request, res: Response) {
    if (!req.user?.sub) {
      throw ApiError.unauthorized();
    }
    await authService.heartbeat(req.user.sub);
    res.json({ ok: true, lastSeen: Date.now() });
  }
}

export const authController = new AuthController();
