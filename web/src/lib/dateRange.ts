// src/lib/dateRange.ts
//
// Small helpers for converting between HTML <input type="date"/"time">'s
// plain string values and the ISO date-time strings the backend's zod
// schemas expect (z.coerce.date() on api/src/modules/rooms/rooms.schemas.ts
// etc). Kept in one place so every form that deals with a date+time range
// builds it the same way.
//
// The database and API are UTC throughout; these helpers treat the
// date/time the user picks as IST wall-clock (see ./istTime.ts) and convert
// to/from the UTC instant the backend actually stores and returns.
import { istWallClockToUtcIso, utcIsoToIstWallClock, formatIstDateTime } from './istTime';

/**
 * Combine separate date ("2026-05-01") and time ("10:00") input values,
 * meant as IST wall-clock, into a single UTC ISO 8601 string for transport.
 */
export function toIsoDateTime(date: string, time: string): string | null {
  return istWallClockToUtcIso(date, time);
}

/** The inverse - split an ISO string back into IST date/time <input> values, for pre-filling a form. */
export function fromIsoDateTime(iso: string | null | undefined): { date: string; time: string } {
  return utcIsoToIstWallClock(iso);
}

export function formatDateTime(iso: string): string {
  return formatIstDateTime(iso);
}
