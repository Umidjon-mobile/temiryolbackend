import { Request, Response } from 'express';
import { submissionsService } from './submissions.service';
import {
  lokomotivCreateSchema,
  korxonaCreateSchema,
  qurulishCreateSchema,
  tamirlashCreateSchema,
  submissionListQuerySchema,
  submissionPatchSchema,
} from './submissions.validators';
import { ApiError } from '@/common/errors/api-error';

class SubmissionsController {
  async createLokomotiv(req: Request, res: Response) {
    const input = lokomotivCreateSchema.parse(req.body);
    const user = req.user!;
    this.scopeCheck(input.stationId, user);
    const result = await submissionsService.createLokomotiv(input, user);
    res.status(201).json({ ok: true, ...result });
  }

  async createKorxona(req: Request, res: Response) {
    const input = korxonaCreateSchema.parse(req.body);
    const user = req.user!;
    this.scopeCheck(input.stationId, user);
    const result = await submissionsService.createKorxona(input, user);
    res.status(201).json({ ok: true, ...result });
  }

  async createQurulish(req: Request, res: Response) {
    const input = qurulishCreateSchema.parse(req.body);
    const user = req.user!;
    this.scopeCheck(input.stationId, user);
    const result = await submissionsService.createQurulish(input, user);
    res.status(201).json({ ok: true, ...result });
  }

  async createTamirlash(req: Request, res: Response) {
    const input = tamirlashCreateSchema.parse(req.body);
    const user = req.user!;
    this.scopeCheck(input.stationId, user);
    const result = await submissionsService.createTamirlash(input, user);
    res.status(201).json({ ok: true, ...result });
  }

  async list(req: Request, res: Response) {
    const query = submissionListQuerySchema.parse(req.query);
    const result = await submissionsService.list(query, req.user!);
    res.json({ ok: true, ...result });
  }

  async update(req: Request, res: Response) {
    const id = String(req.params.id ?? '');
    if (!id) throw ApiError.badRequest('id majburiy');
    const updates = submissionPatchSchema.parse(req.body);
    const result = await submissionsService.update(id, updates, req.user!);
    res.json(result);
  }

  async remove(req: Request, res: Response) {
    const id = String(req.params.id ?? '');
    if (!id) throw ApiError.badRequest('id majburiy');
    const result = await submissionsService.delete(id, req.user!);
    res.json(result);
  }

  /** Offline sync: bir nechta submissionni birdaniga qabul qiladi */
  async offlineSync(req: Request, res: Response) {
    const { items } = req.body as { items: Array<{ category: string; data: unknown }> };
    if (!Array.isArray(items)) throw ApiError.badRequest('items array bo\'lishi kerak');

    const user = req.user!;
    const results: Array<{ ok: boolean; id?: string; error?: string; index: number }> = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      try {
        let r: { id: string };
        if (item.category === 'lokomotiv') {
          const input = lokomotivCreateSchema.parse(item.data);
          this.scopeCheck(input.stationId, user);
          r = await submissionsService.createLokomotiv(input, user);
        } else if (item.category === 'korxona') {
          const input = korxonaCreateSchema.parse(item.data);
          this.scopeCheck(input.stationId, user);
          r = await submissionsService.createKorxona(input, user);
        } else if (item.category === 'qurulish') {
          const input = qurulishCreateSchema.parse(item.data);
          this.scopeCheck(input.stationId, user);
          r = await submissionsService.createQurulish(input, user);
        } else if (item.category === 'tamirlash') {
          const input = tamirlashCreateSchema.parse(item.data);
          this.scopeCheck(input.stationId, user);
          r = await submissionsService.createTamirlash(input, user);
        } else {
          results.push({ ok: false, error: 'Noma\'lum kategoriya', index: i });
          continue;
        }
        results.push({ ok: true, id: r.id, index: i });
      } catch (err) {
        results.push({
          ok: false,
          error: err instanceof Error ? err.message : 'Xato',
          index: i,
        });
      }
    }

    res.json({ ok: true, results, total: items.length, succeeded: results.filter((r) => r.ok).length });
  }

  /** Worker faqat o'z stationId siga yoza oladi */
  private scopeCheck(stationId: string, user: { role: string; stationId?: string | null }) {
    if (user.role === 'worker' && user.stationId !== stationId) {
      throw ApiError.forbidden('Faqat o\'z zapravkangizga yozuv qo\'sha olasiz', 'STATION_MISMATCH');
    }
  }
}

export const submissionsController = new SubmissionsController();
