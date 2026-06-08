import { ClientSession } from 'mongoose';
import { FuelRecordModel, StationModel } from '@/models';
import { toLocalTime } from '@/common/utils/dates';
import type { Category } from '@/common/types';

export interface FuelRecordInput {
  submissionId: string;
  category: Category;
  stationId: string;
  nodeId: string;
  dateISO: string;
  timestamp: number;
  staffCode?: string;
  staffName?: string;

  moveType: string;
  locoSeries?: string;
  locoCode?: string;
  locoNumber?: string;
  trainIndex?: string;
  weight?: string | number;

  balanceBeforeKg?: number;
  fuelAmountKg: number;
  maslaAmountKg?: number;
}

/**
 * Submission yozilganda ham `fuel_records` ga ham yozadi.
 * `session` (transaction) majburiy — atomicity uchun.
 */
export async function writeFuelRecord(
  input: FuelRecordInput,
  session?: ClientSession,
): Promise<void> {
  if (!input.fuelAmountKg || input.fuelAmountKg <= 0) return;

  // Supply point nomi (kesh qilingan bo'lishi mumkin keyinroq)
  const station = await StationModel.findById(input.stationId).session(session ?? null).lean();
  const supplyPoint = station?.name ?? input.stationId;

  const weight = input.weight != null && input.weight !== '' ? String(input.weight) : '';
  const balanceBefore =
    !input.balanceBeforeKg || input.balanceBeforeKg === 0 ? '' : String(input.balanceBeforeKg);
  const maslaAmount =
    input.maslaAmountKg != null && input.maslaAmountKg > 0 ? String(input.maslaAmountKg) : '';

  await FuelRecordModel.create(
    [
      {
        submissionId: input.submissionId,
        category: input.category,
        dateISO: input.dateISO,
        year: Number(input.dateISO.slice(0, 4)),
        time: toLocalTime(input.timestamp),
        timestamp: input.timestamp,
        supplyPoint,
        stationId: input.stationId,
        locCode: input.stationId,
        nodeId: input.nodeId,
        staffCode: input.staffCode ?? '',
        staffName: input.staffName ?? '',
        moveType: input.moveType,
        locoSeries: input.locoSeries ?? '',
        locoCode: input.locoCode ?? '',
        locoNumber: input.locoNumber ?? '',
        trainIndex: input.trainIndex ?? '',
        weight,
        balanceBefore,
        fuelAmount: String(input.fuelAmountKg),
        maslaAmount,
        fuelAmountKg: input.fuelAmountKg,
        maslaAmountKg: input.maslaAmountKg ?? 0,
      },
    ],
    { session },
  );
}

/** Submission delete bo'lganda fuel record ham o'chiriladi */
export async function deleteFuelRecordBySubmission(
  submissionId: string,
  session?: ClientSession,
): Promise<void> {
  await FuelRecordModel.deleteMany({ submissionId }).session(session ?? null);
}
