// src/modules/utilisation/utilisation.service.ts
import { prisma } from '../../prisma/client.js';

// A documented placeholder assumption: there is no "business hours" /
// "room operating hours" concept anywhere in the spec or schema, so
// rather than inventing an unrequested table for it, we treat every room
// as available for a fixed number of hours per week. This keeps the SQL
// below honest (it only aggregates what's ACTUALLY in the bookings table)
// while still answering "hours booked vs hours available" as asked. Swap
// this constant (or make it per-room) if a real operating-hours model is
// ever added - nothing else here would need to change.
const HOURS_AVAILABLE_PER_WEEK = 40;

interface UtilisationRow {
  room_id: string;
  room_name: string;
  week_start: Date;
  hours_booked: number;
}

export interface UtilisationReportRow {
  roomId: string;
  roomName: string;
  weekStart: Date;
  hoursBooked: number;
  hoursAvailable: number;
  utilisationPct: number;
}

// WHY raw SQL: GROUP BY date_trunc('week', b.start_time) groups rows by a
// COMPUTED expression, not a stored column - Prisma's groupBy() API can
// only group by actual columns, not by a transformed value, so there's no
// way to express "one row per room per calendar week" through the query
// builder at all. This is a genuine aggregate query the database computes
// once, over indexed columns (start_time, status) - not "load every
// booking and sum in JS," which is exactly what the spec forbids for this
// view too.
export async function getUtilisationReport(rangeStart: Date, rangeEnd: Date): Promise<UtilisationReportRow[]> {
  const rows = await prisma.$queryRaw<UtilisationRow[]>`
    SELECT
      r.id AS room_id,
      r.name AS room_name,
      date_trunc('week', b.start_time) AS week_start,
      SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 3600.0) AS hours_booked
    FROM bookings b
    JOIN rooms r ON r.id = b.room_id
    WHERE b.status = 'CONFIRMED'
      AND b.start_time >= ${rangeStart}::timestamptz
      AND b.start_time < ${rangeEnd}::timestamptz
    GROUP BY r.id, r.name, date_trunc('week', b.start_time)
    ORDER BY r.name, week_start;
  `;

  return rows.map((row) => {
    const hoursBooked = Number(row.hours_booked);
    return {
      roomId: row.room_id,
      roomName: row.room_name,
      weekStart: row.week_start,
      hoursBooked,
      hoursAvailable: HOURS_AVAILABLE_PER_WEEK,
      utilisationPct: Math.round((hoursBooked / HOURS_AVAILABLE_PER_WEEK) * 1000) / 10,
    };
  });
}
