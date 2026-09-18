// src/modules/utilisation/utilisation.service.ts
import { prisma } from '../../prisma/client.js';

// There is no "business hours" / "room operating hours" concept anywhere
// in the spec or schema, so a room is modeled as available 24x7. Available
// hours for a week ROW is therefore 24 * (number of that week's calendar
// days that actually fall inside [rangeStart, rangeEnd)) - see the SQL's
// `hours_available` expression below, which clamps each row's week to the
// requested range so a partial first/last week (or a single-day query)
// doesn't get credited with a full week's worth of availability.

interface UtilisationRow {
  room_id: string;
  room_name: string;
  week_start: Date;
  // Postgres's numeric/decimal type (what SUM(...)/EXTRACT(...) over a
  // computed EPOCH expression produces) comes back from $queryRaw as a
  // STRING, not a number - node-postgres does this deliberately to avoid
  // silent precision loss for values too large/precise for a JS number.
  // The Number(...) conversions below are real, necessary work, not
  // redundant ones the static type alone would suggest.
  hours_booked: string;
  hours_available: string;
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
  //
  // Casts below are ::timestamp, NOT ::timestamptz - start_time is a plain
  // `timestamp` column (see bookings.service.ts's createBooking comment and
  // the exclusion-constraint migration's SQLSTATE 42P17 note); a
  // ::timestamptz cast here would force an implicit, session-timezone-
  // dependent conversion on every row instead of a straightforward value
  // comparison.
  //
  // date_trunc('week', ...) is shifted by the fixed +05:30 IST offset (and
  // shifted back) so week boundaries land on IST weeks, matching what an
  // IST-thinking admin expects - the naive `b.start_time + interval` here
  // is the same India-only, no-DST shortcut documented in
  // web/src/lib/istTime.ts, mirrored in raw SQL because this aggregate
  // can't be expressed through Prisma's query builder (see file header).
  // Without the shift, this groups by UTC calendar week, which can put a
  // booking an admin considers "Monday morning IST" into the previous
  // UTC week.
  //
  // WHY a CTE: `week_start` needs to be reused by both `hours_booked`'s
  // GROUP BY and `hours_available`'s clamp expression below. Postgres
  // doesn't let a SELECT list reference another computed column's alias,
  // so the `weekly` CTE computes it once per booking row and both
  // aggregates in the outer SELECT read it from there instead of each
  // repeating the date_trunc(...) expression.
  const rows = await prisma.$queryRaw<UtilisationRow[]>`
    WITH weekly AS (
      SELECT
        r.id AS room_id,
        r.name AS room_name,
        date_trunc('week', b.start_time + interval '5 hours 30 minutes') - interval '5 hours 30 minutes' AS week_start,
        b.start_time,
        b.end_time
      FROM bookings b
      JOIN rooms r ON r.id = b.room_id
      WHERE b.status = 'CONFIRMED'
        AND b.start_time >= ${rangeStart}::timestamp
        AND b.start_time < ${rangeEnd}::timestamp
        AND (${roomId}::text IS NULL OR r.id = ${roomId}::text)
    )
    SELECT
      room_id,
      room_name,
      week_start,
      SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0) AS hours_booked,
      -- Rooms are modeled as available 24x7 (no operating-hours concept in
      -- the schema - see this file's header comment). A week ROW's
      -- available hours is the overlap between that week's full 7-day span
      -- and the requested [rangeStart, rangeEnd) window, not a flat
      -- per-week constant - this is what makes a partial first/last week
      -- (or a single-day query) report a correctly smaller availability
      -- instead of a full week's worth.
      EXTRACT(EPOCH FROM (
        LEAST(week_start + interval '7 days', ${rangeEnd}::timestamp)
        - GREATEST(week_start, ${rangeStart}::timestamp)
      )) / 3600.0 AS hours_available,
      COUNT(*) OVER() AS total_count
    FROM weekly
    GROUP BY room_id, room_name, week_start
    ORDER BY room_name, week_start
    LIMIT ${pageSize}
    OFFSET ${offset};
  `;

  const [firstRow] = rows;
  if (firstRow === undefined) return { report: [], total: 0 };

  const total = Number(firstRow.total_count);
  const report = rows.map((row) => {
    const hoursBooked = Number(row.hours_booked);
    const hoursAvailable = Number(row.hours_available);
    return {
      roomId: row.room_id,
      roomName: row.room_name,
      weekStart: row.week_start,
      hoursBooked,
      hoursAvailable,
      utilisationPct: hoursAvailable > 0 ? Math.round((hoursBooked / hoursAvailable) * 1000) / 10 : 0,
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
