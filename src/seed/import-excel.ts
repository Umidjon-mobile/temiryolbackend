/**
 * Excel import — "Оперативное движение топлива" kunlik fayllarini
 * `submissions` kolleksiyasiga yozadi (SINOV ma'lumoti uchun).
 *
 * Ishga tushirish:
 *   npx ts-node-dev -r tsconfig-paths/register --transpile-only src/seed/import-excel.ts          # yozadi
 *   npx ts-node-dev -r tsconfig-paths/register --transpile-only src/seed/import-excel.ts --dry     # faqat tahlil, yozmaydi
 *
 * Har bir yozilgan hujjat `editedBy: 'excel-import'` markeri bilan belgilanadi.
 * Tozalash (qaytarish):  db.submissions.deleteMany({ editedBy: 'excel-import' })
 * Skript idempotent: qayta yugurtirsa, avval shu marker + sanalarni o'chiradi.
 */

import path from 'path';
import ExcelJS from 'exceljs';
import { connectDB, disconnectDB } from '@/config/db';
import {
  SubmissionModel,
  LokomotivSubmissionModel,
  KorxonaSubmissionModel,
  QurulishSubmissionModel,
  DailySummaryModel,
  YearlySummaryModel,
  FuelRecordModel,
} from '@/models';
import { roundKg } from '@/common/utils/decimal';
import { toLocalTime } from '@/common/utils/dates';
import { logger } from '@/common/utils/logger';
import { STATIONS } from './stations.data';

const STATION_NAME = new Map(STATIONS.map((s) => [s.id, s.name]));

const IMPORT_MARKER = 'excel-import';
const DRY = process.argv.includes('--dry');

// Repo ildizidagi fayllar + ularning sanasi (faylnomidagi sana)
const ROOT = path.resolve(__dirname, '../../..');
const FILES: Array<{ file: string; dateISO: string }> = [
  { file: 'spr_day02.06.2026 (3).xlsx', dateISO: '2026-06-02' },
  { file: 'spr_day 03.06.2026й (2).xlsx', dateISO: '2026-06-03' },
  { file: 'spr_day 04.06.2026й..xlsx', dateISO: '2026-06-04' },
];

// ── Stansiya nomi → station lookup ────────────────────────────────
function normName(s: string): string {
  return String(s).toLowerCase().replace(/[`'’ʼ]/g, '').replace(/\s+/g, '');
}
const STATION_BY_NAME = new Map(STATIONS.map((s) => [normName(s.name), s]));

// ── Seriya → rusumi ───────────────────────────────────────────────
const SERIES_MAP: Record<string, string> = {
  '2тэ10м': '2TE10M',
  '3тэ10м': '3TE10M',
  '4тэ10м': '4TE10M',
  'тэм2': 'TEM2',
  'тэм-2': 'TEM2',
  'чмэ-3': 'CHME-3',
  'чмэ3': 'CHME-3',
  'тэп70': 'TEP70',
  'тэп-70': 'TEP70',
};
function mapRusumi(s: string): string {
  const k = String(s).toLowerCase().replace(/\s/g, '');
  return SERIES_MAP[k] ?? (String(s).trim() || '—');
}

type HarakatTuri = 'yuk' | 'yolovchi' | 'manyovr' | 'xojalik' | 'ijara';
type Classified =
  | { category: 'lokomotiv'; harakatTuri: HarakatTuri }
  | { category: 'korxona' }
  | { category: 'qurulish' };

function classify(moveRaw: string, seriesRaw: string): Classified {
  const m = String(moveRaw).toLowerCase().trim();
  if (m.startsWith('предпр')) return { category: 'korxona' };
  if (m.startsWith('строит')) return { category: 'qurulish' };
  if (m.startsWith('манев')) return { category: 'lokomotiv', harakatTuri: 'manyovr' };
  if (m.startsWith('груз')) return { category: 'lokomotiv', harakatTuri: 'yuk' };
  if (m.startsWith('аренд')) return { category: 'lokomotiv', harakatTuri: 'ijara' };
  if (m.startsWith('пасс') || m.startsWith('пригор'))
    return { category: 'lokomotiv', harakatTuri: 'yolovchi' };
  if (m.startsWith('хоз')) return { category: 'lokomotiv', harakatTuri: 'xojalik' };
  // Noma'lum: seriya bo'lsa — ijaraga olingan teplovoz, aks holda korxona
  if (String(seriesRaw).trim()) return { category: 'lokomotiv', harakatTuri: 'ijara' };
  return { category: 'korxona' };
}

// ── Yordamchilar ──────────────────────────────────────────────────
function cellVal(cell: ExcelJS.Cell): unknown {
  let v: unknown = cell.value;
  if (v && typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: Array<{ text: string }> };
    if (o.result !== undefined) v = o.result;
    else if (o.text !== undefined) v = o.text;
    else if (o.richText) v = o.richText.map((t) => t.text).join('');
  }
  return v;
}
function asStr(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}
function asNum(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v ?? '').replace(',', '.').replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

interface BuiltDoc {
  category: string;
  [k: string]: unknown;
}

async function parseFile(file: string, dateISO: string) {
  const [y, mo, d] = dateISO.split('-').map(Number);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(ROOT, file));
  const ws = wb.worksheets[0];

  const docs: BuiltDoc[] = [];
  const skipped: string[] = [];
  let current: { station: (typeof STATIONS)[number]; operator: string } | null = null;

  for (let r = 5; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const c1 = cellVal(row.getCell(1));
    const c2 = cellVal(row.getCell(2));
    const c3 = cellVal(row.getCell(3));

    // Guruh sarlavhasi: barcha ustunlar bir xil matn (Stansiya - Operator)
    const isHeader =
      typeof c1 === 'string' && String(c1) === String(c2) && String(c1) === String(c3) && asStr(c1) !== '';
    if (isHeader) {
      const header = asStr(c1);
      const dashIdx = header.indexOf(' - ');
      if (dashIdx === -1) {
        current = null;
        continue;
      }
      const stationName = header.slice(0, dashIdx).trim();
      const operator = header.slice(dashIdx + 3).trim();
      const station = STATION_BY_NAME.get(normName(stationName));
      if (!station) {
        current = null;
        skipped.push(`stansiya topilmadi: "${stationName}" (R${r})`);
        continue;
      }
      current = { station, operator };
      continue;
    }

    // Ma'lumot qatori: 1-ustun vaqt (Date)
    if (!(c1 instanceof Date)) continue;
    if (!current) continue;

    const hh = c1.getUTCHours();
    const mm = c1.getUTCMinutes();
    const ts = new Date(y, mo - 1, d, hh, mm, 0, 0).getTime();

    const series = asStr(c2);
    const raqami = asStr(c3);
    const moveType = asStr(cellVal(row.getCell(4)));
    const trainField = asStr(cellVal(row.getCell(5)));
    const indeks = asStr(cellVal(row.getCell(6)));
    const poyezdVazni = asNum(cellVal(row.getCell(7)));
    const qoldiq = asNum(cellVal(row.getCell(8)));
    const berildi = asNum(cellVal(row.getCell(9)));

    const cls = classify(moveType, series);
    const base = {
      staffCode: current.station.workerCodes[0] ?? '0000',
      staffName: current.operator,
      stationId: current.station.id,
      nodeId: current.station.nodeId,
      timestamp: ts,
      timestampMs: ts,
      dateISO,
      year: y,
      month: mo,
      day: d,
      editedBy: IMPORT_MARKER,
    };

    if (cls.category === 'lokomotiv') {
      const doc: BuiltDoc = {
        ...base,
        category: 'lokomotiv',
        harakatTuri: cls.harakatTuri,
        rusumi: mapRusumi(series),
        lokomotivNumber: raqami || '—',
        poyezdNumber: trainField,
        ruxsatIndeksi: indeks,
        poyezdVazni,
        qoldiq,
        qanchaBerildi: berildi,
        dizMasla: 0,
      };
      if (cls.harakatTuri === 'manyovr') doc.stansiya = trainField;
      else if (cls.harakatTuri === 'xojalik') doc.tashkilot = trainField;
      else if (cls.harakatTuri === 'ijara') doc.ijarachi = trainField;
      docs.push(doc);
    } else if (cls.category === 'korxona') {
      docs.push({
        ...base,
        category: 'korxona',
        korxonaNomi: trainField || 'Predpriyatie',
        poyezdNumber: trainField,
        ruxsatIndeksi: indeks,
        qancha: berildi,
        nechaSutkalik: 1,
      });
    } else {
      docs.push({
        ...base,
        category: 'qurulish',
        korxonaNomi: trainField,
        seriya: series,
        raqami,
        poyezdNumber: trainField,
        ruxsatIndeksi: indeks,
        poyezdVazni,
        qoldiq,
        qanchaOlindi: berildi,
        qanchaBerildi: berildi,
      });
    }
  }

  return { docs, skipped };
}

// ── Summary qayta-qurish ──────────────────────────────────────────
// Import to'g'ridan-to'g'ri submission kolleksiyalariga yozadi, lekin hisobotlar
// (operativ/svod/monthly/yearly) va operator gauge oldindan hisoblangan
// daily_summaries / yearly_summaries dan o'qiydi. Shu sababli import qilingan
// sanalar uchun summary'larni submissions (source of truth) dan qayta quramiz.
// Mantiq submissions.service.ts bilan bir xil:
//   lokomotiv  → qanchaBerildi, ikki qator (harakatTuri=<turi> + null)
//   korxona    → qancha,        null qator
//   qurulish   → qanchaOlindi||qanchaBerildi, faqat fuel>0 bo'lsa, null qator
//   tamirlash  → qanchaBerildi, null qator
function fuelOf(d: Record<string, unknown>): number {
  if (d.category === 'korxona') return Number(d.qancha) || 0;
  if (d.category === 'qurulish') return (Number(d.qanchaOlindi) || 0) || (Number(d.qanchaBerildi) || 0);
  return Number(d.qanchaBerildi) || 0; // lokomotiv, tamirlash
}

interface SumAcc {
  dateISO?: string;
  year: number;
  stationId: string;
  nodeId: string;
  category: string;
  harakatTuri: string | null;
  totalFuelKg: number;
  totalMaslaKg: number;
  recordCount: number;
}

function accumulate(map: Map<string, SumAcc>, key: string, base: Omit<SumAcc, 'totalFuelKg' | 'totalMaslaKg' | 'recordCount'>, fuel: number, masla: number) {
  const cur = map.get(key);
  if (cur) {
    cur.totalFuelKg += fuel;
    cur.totalMaslaKg += masla;
    cur.recordCount += 1;
  } else {
    map.set(key, { ...base, totalFuelKg: fuel, totalMaslaKg: masla, recordCount: 1 });
  }
}

async function rebuildSummaries(dates: string[], years: number[]) {
  // Daily — faqat import qilingan sanalar; Yearly — butun yil (source of truth dan)
  const dailySubs = await SubmissionModel.find({ dateISO: { $in: dates } }).lean();
  const yearlySubs = await SubmissionModel.find({ year: { $in: years } }).lean();

  // ── Daily ──
  const daily = new Map<string, SumAcc>();
  for (const d of dailySubs as Array<Record<string, unknown>>) {
    const cat = String(d.category);
    const fuel = fuelOf(d);
    const masla = Number(d.dizMasla) || 0;
    if (cat === 'qurulish' && fuel <= 0) continue; // service summary yozmaydi
    const dateISO = String(d.dateISO);
    const stationId = String(d.stationId);
    const nodeId = String(d.nodeId);
    const harakatTuri = cat === 'lokomotiv' ? (d.harakatTuri ? String(d.harakatTuri) : null) : null;
    const nullBase = { dateISO, year: Number(d.year), stationId, nodeId, category: cat, harakatTuri: null };
    accumulate(daily, `${dateISO}|${stationId}|${cat}|null`, nullBase, fuel, masla);
    if (cat === 'lokomotiv' && harakatTuri) {
      const turiBase = { ...nullBase, harakatTuri };
      accumulate(daily, `${dateISO}|${stationId}|${cat}|${harakatTuri}`, turiBase, fuel, masla);
    }
  }

  // ── Yearly ──
  const yearly = new Map<string, SumAcc>();
  for (const d of yearlySubs as Array<Record<string, unknown>>) {
    const cat = String(d.category);
    const fuel = fuelOf(d);
    const masla = Number(d.dizMasla) || 0;
    if (cat === 'qurulish' && fuel <= 0) continue;
    const year = Number(d.year);
    const stationId = String(d.stationId);
    const nodeId = String(d.nodeId);
    const harakatTuri = cat === 'lokomotiv' ? (d.harakatTuri ? String(d.harakatTuri) : null) : null;
    const nullBase = { year, stationId, nodeId, category: cat, harakatTuri: null };
    accumulate(yearly, `${year}|${stationId}|${cat}|null`, nullBase, fuel, masla);
    if (cat === 'lokomotiv' && harakatTuri) {
      const turiBase = { ...nullBase, harakatTuri };
      accumulate(yearly, `${year}|${stationId}|${cat}|${harakatTuri}`, turiBase, fuel, masla);
    }
  }

  const dailyDocs = [...daily.values()].map((a) => ({
    dateISO: a.dateISO,
    stationId: a.stationId,
    nodeId: a.nodeId,
    category: a.category,
    harakatTuri: a.harakatTuri,
    totalFuelKg: roundKg(a.totalFuelKg),
    totalMaslaKg: roundKg(a.totalMaslaKg),
    recordCount: a.recordCount,
  }));
  const yearlyDocs = [...yearly.values()].map((a) => ({
    year: a.year,
    stationId: a.stationId,
    nodeId: a.nodeId,
    category: a.category,
    harakatTuri: a.harakatTuri,
    totalFuelKg: roundKg(a.totalFuelKg),
    totalMaslaKg: roundKg(a.totalMaslaKg),
    recordCount: a.recordCount,
  }));

  const delD = await DailySummaryModel.deleteMany({ dateISO: { $in: dates } });
  const delY = await YearlySummaryModel.deleteMany({ year: { $in: years } });
  if (dailyDocs.length) await DailySummaryModel.insertMany(dailyDocs, { ordered: false });
  if (yearlyDocs.length) await YearlySummaryModel.insertMany(yearlyDocs, { ordered: false });

  logger.success(
    `✓ Summary qayta qurildi — daily: -${delD.deletedCount}/+${dailyDocs.length}, yearly: -${delY.deletedCount}/+${yearlyDocs.length}`,
  );
}

// ── FuelRecord qayta-qurish ───────────────────────────────────────
// Hisobotlar/PDF (Y.PDF, ERJU) sahifasi `/fuel-records` endpointidan o'qiydi.
// Import submission yozadi, lekin fuel_records ni emas — shu sababli import qilingan
// sanalar uchun fuel_records ni submissions (source of truth) dan qayta quramiz.
// Mantiq fuel-records.service.ts (writeFuelRecord) bilan bir xil.
async function rebuildFuelRecords(dates: string[]) {
  const subs = await SubmissionModel.find({ dateISO: { $in: dates } }).lean();
  const docs: Record<string, unknown>[] = [];

  for (const d of subs as Array<Record<string, unknown>>) {
    const cat = String(d.category);
    const fuelKg = fuelOf(d);
    if (!fuelKg || fuelKg <= 0) continue; // writeFuelRecord fuel<=0 da yozmaydi

    const stationId = String(d.stationId);
    const timestamp = Number(d.timestamp);
    const maslaKg = Number(d.dizMasla) || 0;

    let moveType = cat;
    let locoSeries = '';
    let locoCode = '';
    let locoNumber = '';
    let weightNum = 0;
    let balanceNum = 0;
    const trainIndex = String(d.ruxsatIndeksi ?? '');

    if (cat === 'lokomotiv') {
      moveType = String(d.harakatTuri ?? 'lokomotiv');
      locoSeries = String(d.rusumi ?? '');
      locoCode = String(d.lokomotivNumber ?? '');
      if (d.harakatTuri === 'manyovr') locoNumber = String(d.stansiya ?? '');
      else if (d.harakatTuri === 'xojalik') locoNumber = String(d.tashkilot ?? '');
      else if (d.harakatTuri === 'ijara') locoNumber = String(d.ijarachi ?? '');
      else locoNumber = String(d.poyezdNumber ?? '');
      weightNum = Number(d.poyezdVazni) || 0;
      balanceNum = Number(d.qoldiq) || 0;
    } else if (cat === 'korxona') {
      locoNumber = String(d.poyezdNumber ?? '');
    } else if (cat === 'qurulish') {
      locoSeries = String(d.seriya ?? '');
      locoCode = String(d.raqami ?? '');
      weightNum = Number(d.poyezdVazni) || 0;
      balanceNum = Number(d.qoldiq) || 0;
    }

    docs.push({
      submissionId: String(d._id),
      category: cat,
      dateISO: String(d.dateISO),
      year: Number(d.year),
      time: toLocalTime(timestamp),
      timestamp,
      supplyPoint: STATION_NAME.get(stationId) ?? stationId,
      stationId,
      locCode: stationId,
      nodeId: String(d.nodeId),
      staffCode: String(d.staffCode ?? ''),
      staffName: String(d.staffName ?? ''),
      moveType,
      locoSeries,
      locoCode,
      locoNumber,
      trainIndex,
      weight: weightNum > 0 ? String(weightNum) : '',
      balanceBefore: balanceNum === 0 ? '' : String(balanceNum),
      fuelAmount: String(fuelKg),
      maslaAmount: maslaKg > 0 ? String(maslaKg) : '',
      fuelAmountKg: fuelKg,
      maslaAmountKg: maslaKg,
    });
  }

  const del = await FuelRecordModel.deleteMany({ dateISO: { $in: dates } });
  if (docs.length) await FuelRecordModel.insertMany(docs, { ordered: false });
  logger.success(`✓ FuelRecord qayta qurildi — -${del.deletedCount}/+${docs.length}`);
}

async function main() {
  logger.info(`Excel import boshlandi ${DRY ? '(DRY — yozilmaydi)' : ''}`);

  const all: BuiltDoc[] = [];
  const dates = new Set<string>();
  for (const { file, dateISO } of FILES) {
    const { docs, skipped } = await parseFile(file, dateISO);
    dates.add(dateISO);
    const byCat = docs.reduce<Record<string, number>>((a, d) => {
      a[d.category] = (a[d.category] ?? 0) + 1;
      return a;
    }, {});
    logger.info(
      `${file} → ${docs.length} qator | ${Object.entries(byCat).map(([k, v]) => `${k}:${v}`).join(', ')}`,
    );
    skipped.forEach((s) => logger.warn('  ' + s));
    all.push(...docs);
  }

  logger.info(`Jami: ${all.length} ta hujjat, sanalar: ${[...dates].join(', ')}`);

  if (DRY) {
    logger.info('DRY rejim — namuna (birinchi 3):');
    console.log(JSON.stringify(all.slice(0, 3), null, 2));
    return;
  }

  await connectDB();

  // Idempotentlik: avvalgi BARCHA import yozuvlarini o'chiramiz (sanasidan qat'i nazar)
  const del = await SubmissionModel.deleteMany({ editedBy: IMPORT_MARKER });
  logger.info(`Eski import yozuvlari o'chirildi: ${del.deletedCount}`);

  const lok = all.filter((d) => d.category === 'lokomotiv');
  const kor = all.filter((d) => d.category === 'korxona');
  const qur = all.filter((d) => d.category === 'qurulish');

  if (lok.length) await LokomotivSubmissionModel.insertMany(lok, { ordered: false });
  if (kor.length) await KorxonaSubmissionModel.insertMany(kor, { ordered: false });
  if (qur.length) await QurulishSubmissionModel.insertMany(qur, { ordered: false });

  logger.success(
    `✓ Yozildi — lokomotiv: ${lok.length}, korxona: ${kor.length}, qurulish: ${qur.length}`,
  );

  // Hisobotlar/gauge oldindan hisoblangan summary'dan o'qiydi — qayta quramiz
  const years = [...new Set([...dates].map((d) => Number(d.split('-')[0])))];
  await rebuildSummaries([...dates], years);
  await rebuildFuelRecords([...dates]);

  await disconnectDB();
}

main().catch((e) => {
  logger.error('Import xatosi:', e);
  process.exit(1);
});
