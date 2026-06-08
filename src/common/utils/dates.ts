import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Tashkent';

/** "2026-06-04" formatida ISO sana */
export function toDateISO(input?: Date | number | string): string {
  const d = input ? dayjs(input).tz(TZ) : dayjs().tz(TZ);
  return d.format('YYYY-MM-DD');
}

/** Bugungi kun chegaralari (Tashkent vaqti bo'yicha) — millis */
export function todayBounds(): { startMs: number; endMs: number } {
  const start = dayjs().tz(TZ).startOf('day');
  return { startMs: start.valueOf(), endMs: start.endOf('day').valueOf() };
}

/** Berilgan dateISO uchun chegaralar */
export function dateISOBounds(dateISO: string): { startMs: number; endMs: number } {
  const start = dayjs.tz(dateISO, TZ).startOf('day');
  return { startMs: start.valueOf(), endMs: start.endOf('day').valueOf() };
}

/** Yil */
export function yearOf(input?: Date | number | string): number {
  const d = input ? dayjs(input).tz(TZ) : dayjs().tz(TZ);
  return d.year();
}

/** Tashkent vaqti bo'yicha HH:mm */
export function toLocalTime(input?: Date | number | string): string {
  const d = input ? dayjs(input).tz(TZ) : dayjs().tz(TZ);
  return d.format('HH:mm');
}

/**
 * Yozuv shu kunmi? (worker faqat shu kun yozuvini tahrir qila oladi)
 */
export function isSameDay(timestamp: number, refDateISO?: string): boolean {
  const subDate = toDateISO(timestamp);
  const refDate = refDateISO ?? toDateISO();
  return subDate === refDate;
}
