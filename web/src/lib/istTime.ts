// src/lib/istTime.ts
//
// Single source of truth for displaying/interpreting times in IST
// (Asia/Kolkata, UTC+5:30). The database and API wire format stay UTC -
// every ISO string crossing the API boundary is a UTC instant. This module
// converts between that UTC instant and IST wall-clock for display and for
// forms, so no other file hardcodes `timeZone: 'Asia/Kolkata'` on its own.
//
// The `istWallClockToUtcIso`/`istMidnightToUtcIso` arithmetic
// (Date.UTC(...) - fixed offset) is only correct because India has no DST -
// for a timezone with DST this would be wrong for part of the year. This is
// a deliberate, India-specific shortcut, not a general timezone solution.

const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MINUTES = 5 * 60 + 30; // fixed +05:30, no DST

/** Time-of-day in IST, e.g. "10:00 AM". */
export function formatIstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: IST_TIME_ZONE });
}

/** Date in IST, e.g. "1 May 2026". */
export function formatIstDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST_TIME_ZONE });
}

/** Combined date + time in IST, for booking list/history display. */
export function formatIstDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: IST_TIME_ZONE });
}

/**
 * Combine a date ("2026-05-01") and time ("10:00") that the user picked,
 * meant as IST wall-clock, into the UTC ISO instant the backend expects.
 */
export function istWallClockToUtcIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if ([year, month, day, hour, minute].some((n) => n === undefined || Number.isNaN(n))) return null;
  const utcMillis = Date.UTC(year!, month! - 1, day!, hour!, minute!, 0, 0) - IST_OFFSET_MINUTES * 60000;
  return new Date(utcMillis).toISOString();
}

/** Inverse of istWallClockToUtcIso - split a UTC ISO instant into IST wall-clock date/time parts, for form pre-fill. */
export function utcIsoToIstWallClock(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const istMillis = new Date(iso).getTime() + IST_OFFSET_MINUTES * 60000;
  const d = new Date(istMillis);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return { date, time };
}

/** The UTC instant of 00:00:00 IST on the given IST calendar date. */
export function istMidnightToUtcIso(date: string): string {
  return istWallClockToUtcIso(date, '00:00') as string;
}

/** [start, end) UTC instants spanning the full IST calendar day. */
export function istDayUtcRange(date: string): { start: string; end: string } {
  return { start: istMidnightToUtcIso(date), end: istMidnightToUtcIso(addIstDays(date, 1)) };
}

/** The UTC instant of 00:00:00 UTC on the given calendar date (plain UTC midnight, no IST conversion). */
function utcMidnightIso(date: string): string {
  return `${date}T00:00:00.000Z`;
}

/**
 * The UTC-midnight instants of the two UTC calendar dates that an IST
 * calendar day's window overlaps. Because IST is UTC+5:30, an IST day
 * always spans exactly two UTC calendar days: IST midnight falls at 18:30
 * UTC the previous day, so the window runs from 18:30 UTC on (date - 1) to
 * 18:30 UTC on `date`. Backend endpoints that compute "the UTC calendar day
 * containing this instant" (like getRoomDayTimeline) need to be queried
 * once per UTC day here, with the results merged and filtered to the true
 * IST window (see istDayUtcRange).
 */
export function utcMidnightsSpanningIstDay(date: string): [string, string] {
  return [utcMidnightIso(addIstDays(date, -1)), utcMidnightIso(date)];
}

/** Today's IST calendar date as "YYYY-MM-DD". */
export function todayInIst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TIME_ZONE }).format(new Date());
}

/** The first day of the current IST calendar month, as "YYYY-MM-DD". */
export function firstOfMonthInIst(): string {
  const today = todayInIst();
  const [year, month] = today.split('-');
  return `${year}-${month}-01`;
}

/** Advance an IST calendar-date string by n days, purely in calendar space. */
export function addIstDays(date: string, n: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const d = new Date(Date.UTC(year!, month! - 1, day! + n));
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * The Monday of the IST calendar week containing the given IST date
 * string. Mirrors the backend's `date_trunc('week', ...)` grouping (which
 * also treats Monday as the IST week start) and the DatePicker's own
 * `weekStartsOn={1}` - so "the week containing this date" means the same
 * thing on both sides of the API boundary.
 */
export function startOfIstWeek(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const isoWeekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay() || 7; // Mon=1..Sun=7
  return addIstDays(date, 1 - isoWeekday);
}
