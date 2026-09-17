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
  total_count: bigint;
}

export interface UtilisationReportRow {
  roomId: string;
  roomName: string;
  weekStart: Date;
  hoursBooked: number;
  hoursAvailable: number;
  utilisationPct: number;
}

export interface UtilisationReportResult {
  report: UtilisationReportRow[];
  total: number;
}

// WHY raw SQL: GROUP BY date_trunc('week', b.start_time) groups rows by a
// COMPUTED expression, not a stored column - Prisma's groupBy() API can
// only group by actual columns, not by a transformed value, so there's no
// way to express "one row per room per calendar week" through the query
// builder at all. This is a genuine aggregate query the database computes
// once, over indexed columns (start_time, status) - not "load every
// booking and sum in JS," which is exactly what the spec forbids for this
// view too.
export interface UtilisationReportParams {
  rangeStart: Date;
  rangeEnd: Date;
  roomId?: string;
  page: number;
  pageSize: number;
}

// WHY roomId is applied as an extra WHERE clause rather than a separate
// code path: the room-week aggregation and pagination need to happen in
// the SAME query as the filter (see the file-level comment on why this is
// raw SQL) - filtering "in front of" the query in JS would mean fetching
// every room's rows first and discarding most of them, exactly the
// client-side-filter cost the spec forbids for this view.
export async function getUtilisationReport(params: UtilisationReportParams): Promise<UtilisationReportResult> {
  const { rangeStart, rangeEnd, roomId = null, page, pageSize } = params;
  const offset = (page - 1) * pageSize;

  // total_count uses COUNT(*) OVER(), same reasoning as the room search
  // query: one query returns both the page of rows and the full matching
  // row count needed for pagination metadata, instead of a second
  // round-trip COUNT(*) re-running the same GROUP BY.
  const rows = await prisma.$queryRaw<UtilisationRow[]>`
    SELECT
      r.id AS room_id,
      r.name AS room_name,
      date_trunc('week', b.start_time) AS week_start,
      SUM(EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 3600.0) AS hours_booked,
      COUNT(*) OVER() AS total_count
    FROM bookings b
    JOIN rooms r ON r.id = b.room_id
    WHERE b.status = 'CONFIRMED'
      AND b.start_time >= ${rangeStart}::timestamptz
      AND b.start_time < ${rangeEnd}::timestamptz
      AND (${roomId}::text IS NULL OR r.id = ${roomId}::text)
    GROUP BY r.id, r.name, date_trunc('week', b.start_time)
    ORDER BY r.name, week_start
    LIMIT ${pageSize}
    OFFSET ${offset};
  `;

  if (rows.length === 0) return { report: [], total: 0 };

  const total = Number(rows[0].total_count);
  const report = rows.map((row) => {
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

  return { report, total };
}

export interface RoomDayBookingSlot {
  bookingId: string;
  startTime: Date;
  endTime: Date;
  userEmail: string;
}

// WHY this is a plain Prisma query, not raw SQL like the report above:
// "bookings overlapping one calendar day for one room" needs no
// computed-expression GROUP BY - the query builder expresses it directly
// and type-safely, so raw SQL would only add risk with no benefit here.
export async function getRoomDayTimeline(roomId: string, date: Date): Promise<RoomDayBookingSlot[]> {
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const bookings = await prisma.booking.findMany({
    where: {
      roomId,
      status: 'CONFIRMED',
      startTime: { lt: dayEnd },
      endTime: { gt: dayStart },
    },
    orderBy: { startTime: 'asc' },
    select: { id: true, startTime: true, endTime: true, user: { select: { email: true } } },
  });

  return bookings.map((b) => ({
    bookingId: b.id,
    startTime: b.startTime,
    endTime: b.endTime,
    userEmail: b.user.email,
  }));
}
