import { ClientSession } from 'mongoose';
import { DailySummaryModel, YearlySummaryModel } from '@/models';
import type { Category } from '@/common/types';

export interface SummaryDelta {
  dateISO: string;
  year: number;
  stationId: string;
  nodeId: string;
  category: Category;
  harakatTuri?: string | null;   // lokomotiv uchun
  fuelKgDelta: number;            // + qo'shish, - ayrish
  maslaKgDelta: number;
  countDelta: number;             // +1 (yangi), -1 (delete), 0 (faqat qiymat o'zgardi)
}

/**
 * Increment yoki delta orqali summaries ni yangilash.
 * Yangi submission: countDelta=+1, fuelKgDelta=+<qancha>
 * Delete: countDelta=-1, fuelKgDelta=-<eski>
 * Edit:   countDelta=0, fuelKgDelta=+<yangi>-<eski>
 */
export async function applySummaryDelta(
  delta: SummaryDelta,
  session?: ClientSession,
): Promise<void> {
  const harakatTuri = delta.harakatTuri ?? null;

  // Daily
  await DailySummaryModel.updateOne(
    {
      dateISO: delta.dateISO,
      stationId: delta.stationId,
      category: delta.category,
      harakatTuri,
    },
    {
      $setOnInsert: {
        dateISO: delta.dateISO,
        stationId: delta.stationId,
        nodeId: delta.nodeId,
        category: delta.category,
        harakatTuri,
      },
      $inc: {
        totalFuelKg: delta.fuelKgDelta,
        totalMaslaKg: delta.maslaKgDelta,
        recordCount: delta.countDelta,
      },
    },
    { upsert: true, session },
  );

  // Yearly
  await YearlySummaryModel.updateOne(
    {
      year: delta.year,
      stationId: delta.stationId,
      category: delta.category,
      harakatTuri,
    },
    {
      $setOnInsert: {
        year: delta.year,
        stationId: delta.stationId,
        nodeId: delta.nodeId,
        category: delta.category,
        harakatTuri,
      },
      $inc: {
        totalFuelKg: delta.fuelKgDelta,
        totalMaslaKg: delta.maslaKgDelta,
        recordCount: delta.countDelta,
      },
    },
    { upsert: true, session },
  );
}

/** Qulay shortcutlar */
export const summariesService = {
  onCreate: applySummaryDelta,

  async onDelete(
    args: Omit<SummaryDelta, 'fuelKgDelta' | 'maslaKgDelta' | 'countDelta'> & {
      oldFuelKg: number;
      oldMaslaKg: number;
    },
    session?: ClientSession,
  ) {
    await applySummaryDelta(
      {
        dateISO: args.dateISO,
        year: args.year,
        stationId: args.stationId,
        nodeId: args.nodeId,
        category: args.category,
        harakatTuri: args.harakatTuri,
        fuelKgDelta: -args.oldFuelKg,
        maslaKgDelta: -args.oldMaslaKg,
        countDelta: -1,
      },
      session,
    );
  },

  async onUpdate(
    args: Omit<SummaryDelta, 'fuelKgDelta' | 'maslaKgDelta' | 'countDelta'> & {
      oldFuelKg: number;
      newFuelKg: number;
      oldMaslaKg: number;
      newMaslaKg: number;
    },
    session?: ClientSession,
  ) {
    await applySummaryDelta(
      {
        dateISO: args.dateISO,
        year: args.year,
        stationId: args.stationId,
        nodeId: args.nodeId,
        category: args.category,
        harakatTuri: args.harakatTuri,
        fuelKgDelta: args.newFuelKg - args.oldFuelKg,
        maslaKgDelta: args.newMaslaKg - args.oldMaslaKg,
        countDelta: 0,
      },
      session,
    );
  },
};
