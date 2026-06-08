import { Router, Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { DailySummaryModel, YearlySummaryModel, StationModel, NodeModel, SubmissionModel } from '@/models';
import { authMiddleware } from '@/middleware/auth.middleware';
import { asyncHandler } from '@/middleware/async-handler';
import { toDateISO } from '@/common/utils/dates';
import { CATEGORY_LABELS, HARAKAT_LABELS } from '@/common/utils/labels';
import dayjs from 'dayjs';

const router = Router();
router.use(authMiddleware);

/** Excel sarlavha + minimal styling helpers */
function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.height = 22;
}

function styleTotal(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
}

/**
 * 1. OPERATIV — kunlik hisobot
 *    /reports/export/operativ.xlsx?dateISO=
 */
router.get(
  '/operativ.xlsx',
  asyncHandler(async (req: Request, res: Response) => {
    const dateISO = (req.query.dateISO as string) || toDateISO();
    const stationId = req.query.stationId as string | undefined;
    const nodeId = req.query.nodeId as string | undefined;

    const filter: Record<string, unknown> = { dateISO };
    if (req.user!.role === 'worker') filter.stationId = req.user!.stationId;
    else if (stationId) filter.stationId = stationId;
    else if (nodeId) filter.nodeId = nodeId;

    const [summaries, stations, nodes] = await Promise.all([
      DailySummaryModel.find(filter).lean(),
      StationModel.find().lean(),
      NodeModel.find().lean(),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Temir yo'l yoqilg'i tizimi";
    wb.created = new Date();
    const ws = wb.addWorksheet(`Operativ ${dateISO}`);

    // Title
    ws.mergeCells('A1:H1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `OPERATIV HISOBOT · ${dayjs(dateISO).format('DD.MM.YYYY')}`;
    titleCell.font = { size: 14, bold: true };
    titleCell.alignment = { horizontal: 'center' };
    ws.getRow(1).height = 28;

    // Header
    ws.getRow(3).values = ['№', 'РЖУ', 'Zapravka', 'Lokomotiv', 'Korxona', 'Qurilish', 'Tamirlash', 'Jami'];
    styleHeader(ws.getRow(3));

    // Group by stationId
    const stMap: Record<string, { nodeId: string; name: string; nodeName: string; cats: Record<string, number> }> = {};
    for (const s of summaries) {
      if (s.harakatTuri !== null) continue; // Faqat kategoriya umumiy aggregate
      const stId = s.stationId;
      if (!stMap[stId]) {
        const st = stations.find((x) => x._id === stId);
        const nd = nodes.find((n) => n._id === s.nodeId);
        stMap[stId] = {
          nodeId: s.nodeId,
          name: st?.name ?? stId,
          nodeName: nd?.name ?? s.nodeId,
          cats: {},
        };
      }
      stMap[stId]!.cats[s.category] = s.totalFuelKg;
    }

    // Rows
    let rowIdx = 4;
    let grandLok = 0, grandKor = 0, grandQur = 0, grandTam = 0, grandTotal = 0;
    Object.values(stMap)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((item, i) => {
        const lok = item.cats.lokomotiv ?? 0;
        const kor = item.cats.korxona ?? 0;
        const qur = item.cats.qurulish ?? 0;
        const tam = item.cats.tamirlash ?? 0;
        const total = lok + kor + qur + tam;
        grandLok += lok; grandKor += kor; grandQur += qur; grandTam += tam; grandTotal += total;

        ws.getRow(rowIdx).values = [i + 1, item.nodeName, item.name, lok, kor, qur, tam, total];
        rowIdx++;
      });

    // Total row
    const totalRow = ws.getRow(rowIdx);
    totalRow.values = ['', '', 'JAMI', grandLok, grandKor, grandQur, grandTam, grandTotal];
    styleTotal(totalRow);

    // Column widths
    ws.columns = [
      { width: 4 }, { width: 22 }, { width: 18 },
      { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 },
    ];
    // Number format
    for (let c = 4; c <= 8; c++) {
      ws.getColumn(c).numFmt = '#,##0.00';
    }

    // Borders
    for (let r = 3; r <= rowIdx; r++) {
      for (let c = 1; c <= 8; c++) {
        ws.getCell(r, c).border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="operativ-${dateISO}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }),
);

/**
 * 2. MONTHLY — oylik
 *    /reports/export/monthly.xlsx?year=&month=&stationId=
 */
router.get(
  '/monthly.xlsx',
  asyncHandler(async (req: Request, res: Response) => {
    const q = z.object({
      year: z.coerce.number().int(),
      month: z.coerce.number().int().min(1).max(12),
      stationId: z.string().optional(),
      nodeId: z.string().optional(),
    }).parse(req.query);

    const monthStr = String(q.month).padStart(2, '0');
    const startDate = `${q.year}-${monthStr}-01`;
    const endDate = new Date(q.year, q.month, 0).toISOString().slice(0, 10);

    const filter: Record<string, unknown> = {
      dateISO: { $gte: startDate, $lte: endDate },
      harakatTuri: null,
    };
    if (req.user!.role === 'worker') filter.stationId = req.user!.stationId;
    else if (q.stationId) filter.stationId = q.stationId;
    else if (q.nodeId) filter.nodeId = q.nodeId;

    const summaries = await DailySummaryModel.find(filter).sort({ dateISO: 1 }).lean();

    // Group by date → category
    const byDate: Record<string, Record<string, number>> = {};
    for (const s of summaries) {
      byDate[s.dateISO] ??= {};
      byDate[s.dateISO]![s.category] = (byDate[s.dateISO]![s.category] ?? 0) + s.totalFuelKg;
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${q.year}-${monthStr}`);

    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = `OYLIK HISOBOT · ${dayjs(`${q.year}-${monthStr}-01`).format('MMMM YYYY')}`;
    ws.getCell('A1').font = { size: 14, bold: true };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getRow(1).height = 28;

    ws.getRow(3).values = ['Sana', 'Lokomotiv', 'Korxona', 'Qurilish', 'Tamirlash', 'Jami'];
    styleHeader(ws.getRow(3));

    const daysInMonth = new Date(q.year, q.month, 0).getDate();
    let totalLok = 0, totalKor = 0, totalQur = 0, totalTam = 0, totalAll = 0;
    let rowIdx = 4;

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${q.year}-${monthStr}-${String(d).padStart(2, '0')}`;
      const row = byDate[ds] ?? {};
      const lok = row.lokomotiv ?? 0;
      const kor = row.korxona ?? 0;
      const qur = row.qurulish ?? 0;
      const tam = row.tamirlash ?? 0;
      const total = lok + kor + qur + tam;
      totalLok += lok; totalKor += kor; totalQur += qur; totalTam += tam; totalAll += total;

      ws.getRow(rowIdx).values = [dayjs(ds).format('DD.MM.YYYY'), lok, kor, qur, tam, total];
      rowIdx++;
    }

    const totalRow = ws.getRow(rowIdx);
    totalRow.values = ['JAMI', totalLok, totalKor, totalQur, totalTam, totalAll];
    styleTotal(totalRow);

    ws.columns = [{ width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }];
    for (let c = 2; c <= 6; c++) ws.getColumn(c).numFmt = '#,##0.00';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="oylik-${q.year}-${monthStr}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }),
);

/**
 * 3. YEARLY — yillik
 *    /reports/export/yearly.xlsx?year=&stationId=
 */
router.get(
  '/yearly.xlsx',
  asyncHandler(async (req: Request, res: Response) => {
    const q = z.object({
      year: z.coerce.number().int(),
      stationId: z.string().optional(),
      nodeId: z.string().optional(),
    }).parse(req.query);

    const startDate = `${q.year}-01-01`;
    const endDate = `${q.year}-12-31`;
    const filter: Record<string, unknown> = {
      dateISO: { $gte: startDate, $lte: endDate },
      harakatTuri: null,
    };
    if (req.user!.role === 'worker') filter.stationId = req.user!.stationId;
    else if (q.stationId) filter.stationId = q.stationId;
    else if (q.nodeId) filter.nodeId = q.nodeId;

    const monthlyAgg = await DailySummaryModel.aggregate<{ _id: { month: string; category: string }; totalFuelKg: number }>([
      { $match: filter },
      {
        $group: {
          _id: { month: { $substr: ['$dateISO', 5, 2] }, category: '$category' },
          totalFuelKg: { $sum: '$totalFuelKg' },
        },
      },
    ]);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${q.year}`);

    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = `YILLIK HISOBOT · ${q.year}`;
    ws.getCell('A1').font = { size: 14, bold: true };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getRow(1).height = 28;

    ws.getRow(3).values = ['Oy', 'Lokomotiv', 'Korxona', 'Qurilish', 'Tamirlash', 'Jami'];
    styleHeader(ws.getRow(3));

    const UZB_MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
    let totalLok = 0, totalKor = 0, totalQur = 0, totalTam = 0, totalAll = 0;
    let rowIdx = 4;

    for (let m = 1; m <= 12; m++) {
      const monthStr = String(m).padStart(2, '0');
      const row: Record<string, number> = {};
      for (const a of monthlyAgg) {
        if (a._id.month === monthStr) row[a._id.category] = a.totalFuelKg;
      }
      const lok = row.lokomotiv ?? 0;
      const kor = row.korxona ?? 0;
      const qur = row.qurulish ?? 0;
      const tam = row.tamirlash ?? 0;
      const total = lok + kor + qur + tam;
      totalLok += lok; totalKor += kor; totalQur += qur; totalTam += tam; totalAll += total;

      ws.getRow(rowIdx).values = [UZB_MONTHS[m - 1], lok, kor, qur, tam, total];
      rowIdx++;
    }

    const totalRow = ws.getRow(rowIdx);
    totalRow.values = ['JAMI', totalLok, totalKor, totalQur, totalTam, totalAll];
    styleTotal(totalRow);

    ws.columns = [{ width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }];
    for (let c = 2; c <= 6; c++) ws.getColumn(c).numFmt = '#,##0.00';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="yillik-${q.year}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }),
);

/**
 * 4. SVOD — davr bo'yicha
 */
router.get(
  '/svod.xlsx',
  asyncHandler(async (req: Request, res: Response) => {
    const q = z.object({
      startDate: z.string(),
      endDate: z.string(),
      stationId: z.string().optional(),
      category: z.string().optional(),
    }).parse(req.query);

    const filter: Record<string, unknown> = {
      dateISO: { $gte: q.startDate, $lte: q.endDate },
      harakatTuri: null,
    };
    if (req.user!.role === 'worker') filter.stationId = req.user!.stationId;
    else if (q.stationId) filter.stationId = q.stationId;
    if (q.category) filter.category = q.category;

    const rows = await DailySummaryModel.aggregate<{ _id: { stationId: string; category: string }; totalFuelKg: number; totalMaslaKg: number; recordCount: number; days: number }>([
      { $match: filter },
      {
        $group: {
          _id: { stationId: '$stationId', category: '$category' },
          totalFuelKg: { $sum: '$totalFuelKg' },
          totalMaslaKg: { $sum: '$totalMaslaKg' },
          recordCount: { $sum: '$recordCount' },
          days: { $sum: 1 },
        },
      },
    ]);
    const stations = await StationModel.find().lean();
    const stMap = new Map(stations.map((s) => [s._id, s.name]));

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Svod');

    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = `SVOD HISOBOT · ${dayjs(q.startDate).format('DD.MM.YYYY')} - ${dayjs(q.endDate).format('DD.MM.YYYY')}`;
    ws.getCell('A1').font = { size: 14, bold: true };
    ws.getCell('A1').alignment = { horizontal: 'center' };
    ws.getRow(1).height = 28;

    ws.getRow(3).values = ['Zapravka', 'Kategoriya', 'Yoqilg\'i (kg)', 'Diz. masla (kg)', 'Yozuv', 'Kun'];
    styleHeader(ws.getRow(3));

    let grandFuel = 0, grandMasla = 0;
    rows
      .sort((a, b) => (stMap.get(a._id.stationId) ?? '').localeCompare(stMap.get(b._id.stationId) ?? ''))
      .forEach((r, i) => {
        ws.getRow(4 + i).values = [
          stMap.get(r._id.stationId) ?? r._id.stationId,
          CATEGORY_LABELS[r._id.category] ?? r._id.category,
          r.totalFuelKg,
          r.totalMaslaKg,
          r.recordCount,
          r.days,
        ];
        grandFuel += r.totalFuelKg;
        grandMasla += r.totalMaslaKg;
      });

    const totalRowIdx = 4 + rows.length;
    const totalRow = ws.getRow(totalRowIdx);
    totalRow.values = ['JAMI', '', grandFuel, grandMasla, '', ''];
    styleTotal(totalRow);

    ws.columns = [{ width: 22 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 10 }, { width: 10 }];
    for (let c = 3; c <= 4; c++) ws.getColumn(c).numFmt = '#,##0.00';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="svod-${q.startDate}_${q.endDate}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }),
);

/**
 * 5. RAW submissions — Excel tarzida
 */
router.get(
  '/raw.xlsx',
  asyncHandler(async (req: Request, res: Response) => {
    const q = z.object({
      startDate: z.string(),
      endDate: z.string(),
      category: z.enum(['lokomotiv', 'korxona', 'qurulish', 'tamirlash']),
      stationId: z.string().optional(),
    }).parse(req.query);

    const filter: Record<string, unknown> = {
      dateISO: { $gte: q.startDate, $lte: q.endDate },
      category: q.category,
    };
    if (req.user!.role === 'worker') filter.stationId = req.user!.stationId;
    else if (q.stationId) filter.stationId = q.stationId;

    const items = await SubmissionModel.find(filter).sort({ timestamp: 1 }).limit(10000).lean();
    const stations = await StationModel.find().lean();
    const stMap = new Map(stations.map((s) => [s._id, s.name]));

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(`${CATEGORY_LABELS[q.category]}`);

    // Header — kategoriyaga qarab dinamik
    const baseCols = ['Sana', 'Vaqt', 'Zapravka', 'Ishchi'];
    let cols: string[] = [];
    if (q.category === 'lokomotiv') {
      cols = [...baseCols, 'Harakat', 'Rusumi', 'Loko №', 'Poyezd №', 'Vazn', 'Qoldiq', 'Berildi', 'Diz.masla'];
    } else if (q.category === 'korxona') {
      cols = [...baseCols, 'Korxona', 'Qancha', 'Sutkalik', 'Buyruq №', 'Kim', 'Limit', 'Oshiq'];
    } else if (q.category === 'qurulish') {
      cols = [...baseCols, 'Korxona', 'Obyekt', "Mas'ul", 'Lavozim', 'Olindi', 'Berildi'];
    } else {
      cols = [...baseCols, 'Seriya', 'Raqam', 'Tamir turi', 'Berildi', 'Diz.masla', "Mas'ul"];
    }
    ws.getRow(1).values = cols;
    styleHeader(ws.getRow(1));

    items.forEach((item: Record<string, unknown>, i) => {
      const base = [
        dayjs(item.timestamp as number).format('DD.MM.YYYY'),
        dayjs(item.timestamp as number).format('HH:mm'),
        stMap.get(item.stationId as string) ?? item.stationId,
        item.staffName ?? item.staffCode,
      ];
      let row: unknown[] = [];
      if (q.category === 'lokomotiv') {
        row = [...base, HARAKAT_LABELS[item.harakatTuri as string] ?? item.harakatTuri, item.rusumi, item.lokomotivNumber, item.poyezdNumber, item.poyezdVazni, item.qoldiq, item.qanchaBerildi, item.dizMasla];
      } else if (q.category === 'korxona') {
        row = [...base, item.korxonaNomi, item.qancha, item.nechaSutkalik, item.buyruqNumber, item.kimTomonidan, item.limit, item.oshiqMiqdor];
      } else if (q.category === 'qurulish') {
        row = [...base, item.korxonaNomi, item.obyekt, item.masulShaxs, item.lavozim, item.qanchaOlindi, item.qanchaBerildi];
      } else {
        row = [...base, item.seriya, item.raqami, item.tamirlashTuri, item.qanchaBerildi, item.dizMasla, item.masulShaxs];
      }
      ws.getRow(2 + i).values = row as ExcelJS.CellValue[];
    });

    ws.columns = cols.map((c) => ({ width: c.length > 10 ? 16 : 12 }));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${q.category}-${q.startDate}_${q.endDate}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }),
);

export { router as reportsExportRouter };
