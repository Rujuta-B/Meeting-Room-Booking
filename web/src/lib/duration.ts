// src/lib/duration.ts
//
// Formats a duration given in hours (e.g. UtilisationReportRow.hoursBooked)
// as "H:MM" so small durations (a 4-minute booking) don't get rounded away
// to "0.0" the way a 1-decimal hours display does.
export function formatHoursAsHm(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}
