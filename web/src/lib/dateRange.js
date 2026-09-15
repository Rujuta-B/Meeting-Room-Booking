// src/lib/dateRange.js
//
// Small helpers for converting between HTML <input type="date"/"time">'s
// plain string values and the ISO date-time strings the backend's zod
// schemas expect (z.coerce.date() on api/src/modules/rooms/rooms.schemas.ts
// etc). Kept in one place so every form that deals with a date+time range
// builds it the same way.

/**
 * Combine separate date ("2026-05-01") and time ("10:00") input values
 * into a single ISO 8601 string in the browser's local timezone.
 */
export function toIsoDateTime(date, time) {
  if (!date || !time) return null;
  // `new Date('2026-05-01T10:00')` is parsed as LOCAL time by the spec -
  // exactly what we want here, since the <input> values are what the user
  // typed in their own timezone. .toISOString() then converts that to UTC
  // for transport, which is what the backend stores (timestamptz columns
  // are timezone-aware, but always represented/compared in UTC internally).
  return new Date(`${date}T${time}`).toISOString();
}

/** The inverse - split an ISO string back into date/time <input> values, for pre-filling a form. */
export function fromIsoDateTime(iso) {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { date, time };
}

export function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
