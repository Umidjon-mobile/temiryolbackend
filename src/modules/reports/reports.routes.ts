import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { SubmissionModel, DailySummaryModel, YearlySummaryModel, StationModel, NodeModel } from '@/models';
import { authMiddleware } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/async-handler';
import { toDateISO } from '@/common/utils/dates';

const router = Router();
router.use(authMiddleware);

/**
 * 1. OPERATIV — joriy kun bo'yicha real time hisobot.
 *    Har zapravka, har kategoriya — bugungi qiymatlar.
 *
 * GET /reports/operativ?dateISO=2026-06-04&nodeId=
 */
const operativQuerySchema = z.object({
  dateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nodeId: z.string().optional(),
  stationId: z.string().optional(),
});

router.get(
  '/operativ',
  asyncHandler(async (req: Request, res: Response) => {
    const q = operativQuerySchema.parse(req.query);
    const dateISO = q.dateISO ?? toDateISO();

    const filter: Record<string, unknown> = { dateISO };

    // Worker scope
    if (req.user!.role === 'worker') {
      filter.stationId = req.user!.stationId;
    } else {
      if (q.stationId) filter.stationId = q.stationId;
      else if (q.nodeId) filter.nodeId = q.nodeId;
    }

    const summaries = await DailySummaryModel.find(filter).lean();

    // Stations va nodes ni qo'shib chiqarish
    const [stations, nodes] = await Promise.all([
      StationModel.find().lean(),
      NodeModel.find().lean(),
    ]);

    // Grouping: stationId → category → harakatTuri → qiymat
    const stationMap: Record<string, {
      stationId: string;
      nodeId: string;
      stationName: string;
      nodeName: string;
      categories: Record<string, { total: number; count: number; subcategories?: Record<string, { total: number; count: number }> }>;
      totalAll: number;
    }> = {};

    for (const s of summaries) {
      const stId = s.stationId;
      if (!stationMap[stId]) {
        const station = stations.find((st) => st._id === stId);
        const node = nodes.find((n) => n._id === s.nodeId);
        stationMap[stId] = {
          stationId: stId,
          nodeId: s.nodeId,
          stationName: station?.name ?? stId,
          nodeName: node?.name ?? s.nodeId,
          categories: {},
          totalAll: 0,
        };
      }
      const m = stationMap[stId]!;
      const cat = s.category;
      if (!m.categories[cat]) {
        m.categories[cat] = { total: 0, count: 0, subcategories: {} };
      }
      const c = m.categories[cat]!;

      if (s.harakatTuri == null) {
        // Asosiy aggregate (kategoriya umumiy)
        c.total = s.totalFuelKg;
        c.count = s.recordCount;
      } else {
        // Subcategory
        c.subcategories ??= {};
        c.subcategories[s.harakatTuri] = { total: s.totalFuelKg, count: s.recordCount };
      }
    }

    // totalAll hisoblash
    for (const m of Object.values(stationMap)) {
      m.totalAll = Object.values(m.categories).reduce((a, c) => a + c.total, 0);
    }

    const items = Object.values(stationMap).sort((a, b) => a.stationName.localeCompare(b.stationName));
    const grandTotal = items.reduce((a, m) => a + m.totalAll, 0);

    res.json({ ok: true, dateISO, items, grandTotal, stationsCount: items.length });
  }),
);

/**
 * 2. SVOD — interval bo'yicha to'liq hisobot.
 *    Har zapravka × kategoriya × kunlar.
 *
 * GET /reports/svod?startDate=2026-06-01&endDate=2026-06-30&nodeId=
 */
const svodQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  nodeId: z.string().optional(),
  stationId: z.string().optional(),
  category: z.enum(['lokomotiv', 'korxona', 'qurulish', 'tamirlash']).optional(),
});

router.get(
  '/svod',
  asyncHandler(async (req: Request, res: Response) => {
    const q = svodQuerySchema.parse(req.query);

    const match: Record<string, unknown> = {
      dateISO: { $gte: q.startDate, $lte: q.endDate },
      harakatTuri: null, // faqat kategoriya umumiy aggregate
    };

    if (req.user!.role === 'worker') {
      match.stationId = req.user!.stationId;
    } else {
      if (q.stationId) match.stationId = q.stationId;
      else if (q.nodeId) match.nodeId = q.nodeId;
    }

    if (q.category) match.category = q.category;

    const pipeline: import('mongoose').PipelineStage[] = [
      { $match: match },
      {
        $group: {
          _id: { stationId: '$stationId', nodeId: '$nodeId', category: '$category' },
          totalFuelKg: { $sum: '$totalFuelKg' },
          totalMaslaKg: { $sum: '$totalMaslaKg' },
          recordCount: { $sum: '$recordCount' },
          days: { $sum: 1 },
        },
      },
      { $sort: { '_id.stationId': 1, '_id.category': 1 } },
    ];

    const rows = await DailySummaryModel.aggregate(pipeline);

    // Stations qo'shib chiqarish
    const stations = await StationModel.find().lean();
    const stMap = new Map(stations.map((s) => [s._id, s.name]));

    const items = rows.map((r) => ({
      stationId: r._id.stationId,
      stationName: stMap.get(r._id.stationId) ?? r._id.stationId,
      nodeId: r._id.nodeId,
      category: r._id.category,
      totalFuelKg: +r.totalFuelKg.toFixed(2),
      totalMaslaKg: +r.totalMaslaKg.toFixed(2),
      recordCount: r.recordCount,
      days: r.days,
    }));

    res.json({
      ok: true,
      period: { startDate: q.startDate, endDate: q.endDate },
      items,
      grandTotalFuel: +items.reduce((a, i) => a + i.totalFuelKg, 0).toFixed(2),
      grandTotalMasla: +items.reduce((a, i) => a + i.totalMaslaKg, 0).toFixed(2),
    });
  }),
);

/**
 * 3. MONTHLY — oylik hisobot (har kun bo'yicha breakdown).
 *
 * GET /reports/monthly?year=2026&month=6&stationId=
 */
const monthlyQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  stationId: z.string().optional(),
  nodeId: z.string().optional(),
});

router.get(
  '/monthly',
  asyncHandler(async (req: Request, res: Response) => {
    const q = monthlyQuerySchema.parse(req.query);
    const monthStr = String(q.month).padStart(2, '0');
    const startDate = `${q.year}-${monthStr}-01`;
    // Oy oxiri — yangi yoy boshining 1 kun oldingisi
    const endDate = new Date(q.year, q.month, 0).toISOString().slice(0, 10);

    const filter: Record<string, unknown> = {
      dateISO: { $gte: startDate, $lte: endDate },
      harakatTuri: null,
    };

    if (req.user!.role === 'worker') {
      filter.stationId = req.user!.stationId;
    } else {
      if (q.stationId) filter.stationId = q.stationId;
      else if (q.nodeId) filter.nodeId = q.nodeId;
    }

    const summaries = await DailySummaryModel.find(filter).sort({ dateISO: 1 }).lean();

    // Group by dateISO → category
    const byDate: Record<string, Record<string, number>> = {};
    for (const s of summaries) {
      byDate[s.dateISO] ??= {};
      byDate[s.dateISO]![s.category] = (byDate[s.dateISO]![s.category] ?? 0) + s.totalFuelKg;
    }

    // To'liq oy — har kun uchun (yo'q kunlar 0 bilan)
    const daysInMonth = new Date(q.year, q.month, 0).getDate();
    const days: Array<{ dateISO: string; lokomotiv: number; korxona: number; qurulish: number; tamirlash: number; total: number }> = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${q.year}-${monthStr}-${String(d).padStart(2, '0')}`;
      const row = byDate[ds] ?? {};
      const lok = +(row.lokomotiv ?? 0).toFixed(2);
      const kor = +(row.korxona ?? 0).toFixed(2);
      const qur = +(row.qurulish ?? 0).toFixed(2);
      const tam = +(row.tamirlash ?? 0).toFixed(2);
      days.push({
        dateISO: ds,
        lokomotiv: lok,
        korxona: kor,
        qurulish: qur,
        tamirlash: tam,
        total: +(lok + kor + qur + tam).toFixed(2),
      });
    }

    const totals = {
      lokomotiv: +days.reduce((a, d) => a + d.lokomotiv, 0).toFixed(2),
      korxona: +days.reduce((a, d) => a + d.korxona, 0).toFixed(2),
      qurulish: +days.reduce((a, d) => a + d.qurulish, 0).toFixed(2),
      tamirlash: +days.reduce((a, d) => a + d.tamirlash, 0).toFixed(2),
      grand: +days.reduce((a, d) => a + d.total, 0).toFixed(2),
    };

    res.json({ ok: true, year: q.year, month: q.month, days, totals });
  }),
);

/**
 * 4. YEARLY — yillik hisobot (har oy va kategoriya).
 *
 * GET /reports/yearly?year=2026&stationId=
 */
const yearlyQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  stationId: z.string().optional(),
  nodeId: z.string().optional(),
});

router.get(
  '/yearly',
  asyncHandler(async (req: Request, res: Response) => {
    const q = yearlyQuerySchema.parse(req.query);

    const filter: Record<string, unknown> = {
      year: q.year,
      harakatTuri: null,
    };

    if (req.user!.role === 'worker') {
      filter.stationId = req.user!.stationId;
    } else {
      if (q.stationId) filter.stationId = q.stationId;
      else if (q.nodeId) filter.nodeId = q.nodeId;
    }

    // Yearly summary — to'g'ri keladi
    const yearly = await YearlySummaryModel.find(filter).lean();

    // Oy bo'yicha breakdown — daily summarylardan
    const startDate = `${q.year}-01-01`;
    const endDate = `${q.year}-12-31`;
    const monthlyFilter: Record<string, unknown> = {
      dateISO: { $gte: startDate, $lte: endDate },
      harakatTuri: null,
    };
    if (filter.stationId) monthlyFilter.stationId = filter.stationId;
    if (filter.nodeId) monthlyFilter.nodeId = filter.nodeId;

    const monthlyAgg = await DailySummaryModel.aggregate([
      { $match: monthlyFilter },
      {
        $group: {
          _id: { month: { $substr: ['$dateISO', 5, 2] }, category: '$category' },
          totalFuelKg: { $sum: '$totalFuelKg' },
          recordCount: { $sum: '$recordCount' },
        },
      },
    ]);

    // 12 oy uchun matritsa
    const months: Array<{ month: number; lokomotiv: number; korxona: number; qurulish: number; tamirlash: number; total: number }> = [];
    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const row: Record<string, number> = {};
      for (const a of monthlyAgg) {
        if (a._id.month === monthStr) row[a._id.category] = a.totalFuelKg;
      }
      const lok = +(row.lokomotiv ?? 0).toFixed(2);
      const kor = +(row.korxona ?? 0).toFixed(2);
      const qur = +(row.qurulish ?? 0).toFixed(2);
      const tam = +(row.tamirlash ?? 0).toFixed(2);
      months.push({
        month: m,
        lokomotiv: lok,
        korxona: kor,
        qurulish: qur,
        tamirlash: tam,
        total: +(lok + kor + qur + tam).toFixed(2),
      });
    }

    // Yillik aggregate
    const totals = {
      lokomotiv: +(yearly.filter((y) => y.category === 'lokomotiv').reduce((a, y) => a + y.totalFuelKg, 0)).toFixed(2),
      korxona: +(yearly.filter((y) => y.category === 'korxona').reduce((a, y) => a + y.totalFuelKg, 0)).toFixed(2),
      qurulish: +(yearly.filter((y) => y.category === 'qurulish').reduce((a, y) => a + y.totalFuelKg, 0)).toFixed(2),
      tamirlash: +(yearly.filter((y) => y.category === 'tamirlash').reduce((a, y) => a + y.totalFuelKg, 0)).toFixed(2),
      grand: +(yearly.reduce((a, y) => a + y.totalFuelKg, 0)).toFixed(2),
    };

    res.json({ ok: true, year: q.year, months, totals, recordsTotal: yearly.reduce((a, y) => a + y.recordCount, 0) });
  }),
);

/**
 * 5. RAW submissions — ma'lum kun va kategoriya uchun barcha yozuvlar.
 *    Excel export uchun frontend ishlatadi.
 */
const rawQuerySchema = z.object({
  dateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: z.enum(['lokomotiv', 'korxona', 'qurulish', 'tamirlash']),
  stationId: z.string().optional(),
  nodeId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
});

router.get(
  '/raw',
  asyncHandler(async (req: Request, res: Response) => {
    const q = rawQuerySchema.parse(req.query);
    const filter: Record<string, unknown> = { category: q.category };

    if (req.user!.role === 'worker') {
      filter.stationId = req.user!.stationId;
    } else {
      if (q.stationId) filter.stationId = q.stationId;
      else if (q.nodeId) filter.nodeId = q.nodeId;
    }

    if (q.dateISO) {
      filter.dateISO = q.dateISO;
    } else if (q.startDate || q.endDate) {
      const range: Record<string, string> = {};
      if (q.startDate) range.$gte = q.startDate;
      if (q.endDate) range.$lte = q.endDate;
      filter.dateISO = range;
    }

    const items = await SubmissionModel.find(filter).sort({ timestamp: 1 }).limit(q.limit).lean();
    res.json({ ok: true, items, total: items.length });
  }),
);

export { router as reportsRouter };
