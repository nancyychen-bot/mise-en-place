import type { DaysOfWeek } from './types';

/**
 * Returns true if slotTime (e.g. "19:00") falls within [earliest, latest] inclusive.
 */
export function isSlotInWindow(
  slotTime: string,
  earliest: string,
  latest: string
): boolean {
  // Compare HH:MM strings lexicographically — valid since they're zero-padded
  return slotTime >= earliest && slotTime <= latest;
}

/**
 * Returns true if `date` is within the next `days` calendar days from today (inclusive).
 */
export function isDateInDayRange(date: Date, days: number): boolean {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  return diffDays >= 0 && diffDays < days;
}

/**
 * Returns true if the day of week of `date` is allowed by `pattern`.
 */
export function isDayOfWeekAllowed(date: Date, pattern: DaysOfWeek): boolean {
  const dow = date.getDay(); // 0=Sun, 1=Mon … 6=Sat
  switch (pattern) {
    case 'all':
      return true;
    case 'weekdays':
      return dow >= 1 && dow <= 5;
    case 'weekends':
      return dow === 0 || dow === 6;
    case 'sat':
      return dow === 6;
    case 'fri-sun':
      return dow === 5 || dow === 6 || dow === 0;
    default:
      return true;
  }
}

/**
 * Returns true if `now` (defaults to current time) falls within [start, end).
 * Handles spans within a single day only (does NOT wrap midnight — use
 * isCurrentTimeInQuietHours for that, which handles midnight-spanning ranges).
 */
export function isCurrentTimeInActiveHours(
  start: string,
  end: string,
  now: Date = new Date()
): boolean {
  const current = toHHMM(now);
  return current >= start && current < end;
}

/**
 * Returns true if `now` is within quiet hours.
 * Handles midnight-spanning ranges: e.g. "22:00"–"07:00" means
 * 22:00–23:59 OR 00:00–07:00.
 */
export function isCurrentTimeInQuietHours(
  start: string,
  end: string,
  now: Date = new Date()
): boolean {
  const current = toHHMM(now);

  if (start <= end) {
    // Normal range (e.g. "09:00"–"17:00")
    return current >= start && current < end;
  } else {
    // Midnight-spanning range (e.g. "22:00"–"07:00")
    return current >= start || current < end;
  }
}

function toHHMM(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Returns an array of date strings "YYYY-MM-DD" for the next `days` days
 * starting from today, filtered by `daysOfWeek`.
 */
export function getDateRange(days: number, pattern: DaysOfWeek): string[] {
  const result: string[] = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    if (isDayOfWeekAllowed(d, pattern)) {
      result.push(d.toISOString().slice(0, 10));
    }
  }

  return result;
}
