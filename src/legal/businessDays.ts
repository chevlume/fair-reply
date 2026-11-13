import { HOLIDAY_DATES, TIMEZONE } from './assumptions-bridge';

/**
 * Business days are Monday–Friday in Europe/Madrid, excluding the encoded
 * Spanish national holidays. The start calendar day is not counted: the
 * function walks forward and preserves the Madrid wall-clock time.
 */

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface MadridParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

export function madridParts(instant: Date): MadridParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(instant).map((part) => [part.type, part.value]));
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const weekday = WEEKDAY[parts.weekday];
  if (weekday === undefined) {
    throw new Error(`Unrecognised weekday from ${TIMEZONE}: ${parts.weekday}`);
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday,
  };
}

export function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function shiftDate(year: number, month: number, day: number, deltaDays: number): { year: number; month: number; day: number } {
  const next = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

export function weekdayOfDate(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isBusinessDay(year: number, month: number, day: number): boolean {
  const weekday = weekdayOfDate(year, month, day);
  if (weekday === 0 || weekday === 6) return false;
  return !HOLIDAY_DATES.has(isoDate(year, month, day));
}

function madridOffsetMs(instant: Date): number {
  const parts = madridParts(instant);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - instant.getTime();
}

/** Convert a Madrid civil time to a UTC instant. Safe across the DST change. */
export function madridLocalToUtc(year: number, month: number, day: number, hour: number, minute: number, second: number): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset1 = madridOffsetMs(new Date(guess));
  let utc = guess - offset1;
  const offset2 = madridOffsetMs(new Date(utc));
  if (offset2 !== offset1) utc = guess - offset2;
  return new Date(utc);
}

/** Calendar days in Europe/Madrid, including weekends and holidays. Wall-clock time is kept. */
export function addCalendarDays(start: Date, days: number): Date {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error('days must be a non-negative integer');
  }
  if (Number.isNaN(start.getTime())) {
    throw new Error('start is not a valid date');
  }
  const startParts = madridParts(start);
  const next = shiftDate(startParts.year, startParts.month, startParts.day, days);
  return madridLocalToUtc(next.year, next.month, next.day, startParts.hour, startParts.minute, startParts.second);
}

export function addBusinessDays(start: Date, days: number): Date {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error('days must be a non-negative integer');
  }
  if (Number.isNaN(start.getTime())) {
    throw new Error('start is not a valid date');
  }
  const startParts = madridParts(start);
  let year = startParts.year;
  let month = startParts.month;
  let day = startParts.day;
  let left = days;
  while (left > 0) {
    const next = shiftDate(year, month, day, 1);
    year = next.year;
    month = next.month;
    day = next.day;
    if (isBusinessDay(year, month, day)) left -= 1;
  }
  return madridLocalToUtc(year, month, day, startParts.hour, startParts.minute, startParts.second);
}
