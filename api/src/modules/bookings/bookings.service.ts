// src/modules/bookings/bookings.service.ts
//
// This file is the core of the whole POC. Two things worth reading
// carefully before anything else in this codebase:
//
// 1. WHY createBooking/createSeries use prisma.$executeRaw INSERT instead
//    of the typed prisma.booking.create(): Prisma's client API doesn't
//    know the EXCLUDE constraint exists at all (it's bolted on via
//    hand-written SQL - see prisma/migrations/<ts>_add_booking_exclusion_constraint).
//    A constraint violation on a raw INSERT surfaces as a
//    PrismaClientKnownRequestError with the generic P2010 "raw query
//    failed" code, carrying the ORIGINAL Postgres error code (23P01) at
//    err.meta.code - a single, well-documented shape errorHandler.ts
//    checks for directly (see that file for the verified detail). Note
//    shortenBooking() below uses the ordinary typed prisma.booking.update()
//    instead: once its own validation guarantees the new window is
//    strictly SMALLER than the current one (see that function), no new
//    overlap can be introduced, so there's no constraint-violation path
//    to translate for that call - the raw-SQL treatment is specifically
//    for the two calls that can genuinely create a fresh overlap.
//
// 2. The concurrency guarantee itself does NOT live in this file. This
//    file does not check "is this slot free?" before inserting - it just
//    tries the insert and lets Postgres decide. That's deliberate: any
//    check-then-insert in application code has a race window between the
//    check and the insert where two concurrent requests could both pass
//    the check. The EXCLUDE constraint (prisma/migrations/.../migration.sql)
//    is what actually guarantees correctness; this file's job is just to
//    attempt the write and translate a constraint failure into a clean API
//    error via errorHandler.ts.
import { randomUUID } from 'node:crypto';
import { prisma } from '../../prisma/client.js';
import { ForbiddenError, NotFoundError, bookingAlreadyStartedError, bookingTooCloseToEndError, notAShortenError } from '../../lib/errors.js';
import { MIN_BOOKING_DURATION_MS } from './bookings.schemas.js';
import type { CreateBookingInput, ShortenBookingInput, CreateSeriesInput, ListMyBookingsQueryInput } from './bookings.schemas.js';

export interface BookingRecord {
  id: string;
  roomId: string;
  userId: string;
  seriesId: string | null;
  startTime: Date;
  endTime: Date;
  status: 'CONFIRMED' | 'CANCELLED';
}

export interface BookingWithRoom extends BookingRecord {
  room: { name: string; floor: number };
}

async function assertRoomExists(roomId: string): Promise<void> {
  // A well-formed but nonexistent room id is exactly the case the spec
  // calls out: "a reference to a room that doesn't exist should be
  // rejected before it reaches your business logic." The UUID *format*
  // was already checked by the zod schema; this is the database-backed
  // half of that same requirement, checked as the very first thing this
  // service does.
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true } });
  if (!room) throw new NotFoundError('Room');
}

// The one raw-SQL insert that the EXCLUDE constraint actually guards. Note
// there is deliberately NO "check for overlap" query before this - see the
// file-level comment above for why that would be unsafe under concurrency.
export async function createBooking(userId: string, input: CreateBookingInput, seriesId?: string): Promise<BookingRecord> {
  await assertRoomExists(input.roomId);

  const id = randomUUID();

  // Cast to ::timestamp, NOT ::timestamptz - start_time/end_time are plain
  // `timestamp` columns with no time zone (see the exclusion-constraint
  // migration's SQLSTATE 42P17 comment and rooms.service.ts's availability
  // search, which cast the same way for the same reason). Casting to
  // timestamptz here would force an implicit, session-timezone-dependent
  // conversion on every write - correct only by coincidence of whatever the
  // Postgres session's TimeZone happens to default to, not guaranteed by
  // anything this app controls.
  await prisma.$executeRaw`
    INSERT INTO bookings (id, room_id, user_id, series_id, start_time, end_time, status, created_at, updated_at)
    VALUES (${id}, ${input.roomId}, ${userId}, ${seriesId ?? null}, ${input.startTime}::timestamp, ${input.endTime}::timestamp, 'CONFIRMED', now(), now())
  `;
  // If the above throws, it's either a real bug or - the interesting case
  // - a Postgres exclusion_violation (code 23P01), which propagates up
  // through this function, through the controller, to errorHandler.ts,
  // which is the ONE place that knows how to turn it into a clean 409
  // BOOKING_CONFLICT. This function itself doesn't need a try/catch for
  // that case at all - "let it throw and translate centrally" is the
  // whole design.

  return {
    id,
    roomId: input.roomId,
    userId,
    seriesId: seriesId ?? null,
    startTime: input.startTime,
    endTime: input.endTime,
    status: 'CONFIRMED',
  };
}

export interface ListMyBookingsResult {
  bookings: BookingWithRoom[];
  total: number;
}

// Includes the related room's name/floor - a user with bookings across
// multiple rooms otherwise can't tell them apart in a plain time-only list.
// Paginated the same way as the rooms list/search endpoints (see
// rooms.schemas.ts's PaginationSchema): skip/take plus a separate count,
// rather than returning every booking a user has ever made in one response.
export async function listMyBookings(userId: string, input: ListMyBookingsQueryInput): Promise<ListMyBookingsResult> {
  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where: { userId },
      orderBy: { startTime: 'asc' },
      include: { room: { select: { name: true, floor: true } } },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.booking.count({ where: { userId } }),
  ]);

  return { bookings, total };
}

async function getOwnedBooking(bookingId: string, userId: string): Promise<BookingRecord> {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new NotFoundError('Booking');

  // WHY this check happens here, unconditionally, before ANY mutation:
  // this is what makes "a user can cancel/shorten only their own
  // bookings - including reaching someone else's booking directly by ID"
  // true. It runs on every cancel/shorten call, regardless of what the
  // frontend does or doesn't show - the spec explicitly requires this be
  // provable with a test, not just a UI check, because a UI check is
  // trivially bypassed with a direct API call.
  if (booking.userId !== userId) {
    throw new ForbiddenError('You can only modify your own bookings.');
  }

  return booking;
}

// Fixed +05:30 IST offset, no DST - the same India-only shortcut documented
// in web/src/lib/istTime.ts, mirrored here because BookingSeries's
// descriptive metadata (dayOfWeek/dayOfMonth/startTimeOfDay/endTimeOfDay)
// must reflect the IST calendar day/time the user actually picked, not the
// UTC calendar day/time of the resulting instant - those can disagree for
// any booking near the IST/UTC day boundary (e.g. 00:30 IST is 19:00 UTC
// the PREVIOUS day). If this backend is ever asked to support a timezone
// with DST, this fixed-offset approach would need replacing with a real
// IANA-timezone-aware library - not needed today since this app is IST-only.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

function toIstWallClockParts(instant: Date): { dayOfWeek: number; dayOfMonth: number; timeOfDay: string } {
  const ist = new Date(instant.getTime() + IST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    dayOfWeek: ist.getUTCDay(),
    dayOfMonth: ist.getUTCDate(),
    timeOfDay: `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`,
  };
}

function assertNotAlreadyStarted(booking: BookingRecord): void {
  // WHY this is a plain JS check comparing against `new Date()`, not a
  // database constraint: "has this booking already started" depends on
  // the CURRENT moment in time, which isn't a static property of a row
  // that Postgres should enforce as a constraint - it's a business rule
  // evaluated at the moment of the request. Documented rule: once a
  // booking has started, it can no longer be CANCELLED, because the room
  // was already in use for that time - retroactively erasing a booking
  // that already happened would corrupt the audit trail and the
  // utilisation report, both of which assume CONFIRMED bookings reflect
  // what actually occurred. Shortening a started-but-still-running booking
  // is handled separately below (assertShortenableNow) - unlike a cancel,
  // a shorten still leaves an accurate record of what happened up to the
  // new (earlier) end time, so it doesn't need to be blocked the instant
  // the booking starts, only once there's no meaningful time left to trim.
  if (booking.startTime <= new Date()) {
    throw bookingAlreadyStartedError();
  }
}

// Shorten is allowed on a booking that's already started, right up until
// fewer than MIN_BOOKING_DURATION_MS remain before its CURRENT end - e.g. a
// 10:00-11:00 booking can be shortened at 10:45 (15 min left) but not at
// 10:51 (9 min left). Past that point there's no meaningfully shorter
// booking left to shrink it to (the new end would have to land inside the
// last few minutes, which is indistinguishable from "just let it finish"),
// so it's treated the same as any other booking too close to done to edit.
function assertShortenableNow(booking: BookingRecord): void {
  if (booking.endTime.getTime() - Date.now() < MIN_BOOKING_DURATION_MS) {
    throw bookingTooCloseToEndError();
  }
}

export async function cancelBooking(bookingId: string, userId: string): Promise<void> {
  const booking = await getOwnedBooking(bookingId, userId);
  assertNotAlreadyStarted(booking);

  // Soft-cancel: UPDATE status, never DELETE - see schema.prisma for the
  // full reasoning (audit trail + the partial exclusion constraint). This
  // single UPDATE is also what makes the freed slot IMMEDIATELY bookable
  // again: the moment status flips away from 'CONFIRMED', the row drops
  // out of the exclusion constraint's WHERE clause, so a new booking for
  // the same room+time is accepted on the very next request - no separate
  // "release the lock" step needed.
  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'CANCELLED' },
  });
}

export async function shortenBooking(bookingId: string, userId: string, input: ShortenBookingInput): Promise<BookingRecord> {
  const booking = await getOwnedBooking(bookingId, userId);
  // Unlike cancelBooking, shorten does NOT call assertNotAlreadyStarted -
  // a booking that's already started can still be shortened, just not
  // once it's about to end anyway (see assertShortenableNow).
  assertShortenableNow(booking);

  // Two DIFFERENT invalid-input cases, deliberately checked and reported
  // separately rather than collapsed into one:
  //   1. The new end time doesn't leave a positive-length booking at all
  //      (at or before the booking's OWN start) - nonsensical regardless
  //      of what endpoint this is.
  //   2. The new end time isn't actually EARLIER than the current one -
  //      this is the "/shorten" endpoint specifically, so an endTime that
  //      would EXTEND the booking (or leave it unchanged) is not a valid
  //      use of this endpoint, even though it would otherwise be a
  //      perfectly fine time range. A caller that wants to extend a
  //      booking needs a different, explicit operation - silently
  //      allowing extension through an endpoint literally named "shorten"
  //      would contradict both the route's own name and the comment further
  //      down about the EXCLUDE constraint only needing to defend against
  //      shrinking, which is only true if THIS check actually enforces that.
  if (input.endTime <= booking.startTime) {
    throw notAShortenError();
  }
  if (input.endTime >= booking.endTime) {
    throw notAShortenError();
  }
  // Same "at least 10 minutes" rule bookings are created under, re-applied
  // here since shortening can otherwise produce a sliver booking shorter
  // than any booking is allowed to be created with in the first place.
  if (input.endTime.getTime() - booking.startTime.getTime() < MIN_BOOKING_DURATION_MS) {
    throw notAShortenError('A booking must be at least 10 minutes long.');
  }
  // The new end time must still be in the future - shortening a
  // just-started booking to an end time that's already passed would be
  // indistinguishable from cancelling it outright through the wrong
  // endpoint, bypassing assertNotAlreadyStarted's cancel-side guarantees.
  if (input.endTime <= new Date()) {
    throw notAShortenError('The new end time must be in the future.');
  }

  // A plain UPDATE, not raw SQL - now that the check above GUARANTEES the
  // window only shrinks, this genuinely cannot create a new overlap that
  // didn't already exist. It's still re-checked by the same EXCLUDE
  // constraint on every UPDATE regardless, as a defensive belt-and-braces
  // guarantee - we don't have to trust our own reasoning in code alone,
  // Postgres verifies it too.
  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { endTime: input.endTime },
  });

  return updated;
}

// Computes the Nth occurrence's start time for a given pattern, all
// derived from the FIRST occurrence's own start (`firstStart`) - there is
// no separate weekday/day-of-month input anywhere (see
// bookings.schemas.ts's CreateSeriesSchema comment). MONTHLY clamps to the
// last day of the target month when the anchor day doesn't exist there
// (e.g. anchor day 31 in a 30-day or February target month) using the
// standard "day 0 of next month = last day of this month" trick - this
// arithmetic is done in IST-shifted space (see IST_OFFSET_MS) and shifted
// back at the end, because the "day of month" a user picked is an IST
// calendar day - anchoring on the UTC calendar day instead would land the
// occurrence on the wrong date for any booking near the IST/UTC day
// boundary (e.g. 00:30 IST is 19:00 UTC the PREVIOUS day).
function computeOccurrenceStart(pattern: CreateSeriesInput['pattern'], firstStart: Date, index: number): Date {
  if (pattern === 'DAILY') {
    return new Date(firstStart.getTime() + index * 24 * 60 * 60 * 1000);
  }
  if (pattern === 'WEEKLY') {
    return new Date(firstStart.getTime() + index * 7 * 24 * 60 * 60 * 1000);
  }

  const firstStartIst = new Date(firstStart.getTime() + IST_OFFSET_MS);
  const anchorDay = firstStartIst.getUTCDate();
  const targetMonthIndex = firstStartIst.getUTCMonth() + index;
  const daysInTargetMonth = new Date(Date.UTC(firstStartIst.getUTCFullYear(), targetMonthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.min(anchorDay, daysInTargetMonth);

  const resultIst = new Date(firstStartIst);
  resultIst.setUTCMonth(targetMonthIndex, clampedDay);
  return new Date(resultIst.getTime() - IST_OFFSET_MS);
}

// WHY series creation happens inside a Prisma $transaction: creating N
// occurrences should be all-or-nothing from the CALLER's point of view - if
// occurrence #5 collides with an existing booking, we don't want
// occurrences #1-4 left dangling as a "series" that's silently missing part
// of its run. Wrapping the whole loop in a transaction means any failure
// (including a 23P01 from the exclusion constraint) rolls back every
// occurrence created so far in this call. Note this transaction is about
// CREATION being atomic - it has nothing to do with the overlap guarantee
// itself, which is still owned entirely by the EXCLUDE constraint on each
// individual INSERT. This holds regardless of which pattern generated the
// occurrence dates below - DAILY/WEEKLY/MONTHLY all funnel through the same
// per-occurrence raw INSERT, so the exact same guarantee applies to all
// three.
//
// A DEFERRABLE (checked at COMMIT, not per-statement) exclusion constraint
// combined with an interactive $transaction like this one is a documented
// edge case where Prisma has, in some versions, failed to surface the
// resulting error at all. Our constraint is NOT deferrable (see the
// migration SQL - no DEFERRABLE clause), so it is checked synchronously on
// each INSERT below, inside this same transaction, exactly like it would
// be outside one - this paragraph is here so that if anyone is ever
// tempted to add DEFERRABLE to the constraint, they re-check this
// interaction first rather than silently losing error visibility here.
export async function createSeries(userId: string, input: CreateSeriesInput) {
  await assertRoomExists(input.roomId);

  const durationMs = input.endTime.getTime() - input.startTime.getTime();

  // Descriptive metadata only (see schema.prisma) - derived from the IST
  // wall-clock the user actually picked, not the UTC calendar day/time of
  // the resulting instant, so a future "Repeats every Monday at 10:00"-style
  // label (or MONTHLY's day-of-month anchor) reflects what the user meant
  // rather than a UTC-shifted approximation of it.
  const startIst = toIstWallClockParts(input.startTime);
  const endIst = toIstWallClockParts(input.endTime);

  return prisma.$transaction(async (tx) => {
    const series = await tx.bookingSeries.create({
      data: {
        userId,
        roomId: input.roomId,
        pattern: input.pattern,
        dayOfWeek: input.pattern === 'WEEKLY' ? startIst.dayOfWeek : null,
        dayOfMonth: input.pattern === 'MONTHLY' ? startIst.dayOfMonth : null,
        startTimeOfDay: startIst.timeOfDay,
        endTimeOfDay: endIst.timeOfDay,
        occurrenceCount: input.occurrenceCount,
      },
    });

    const occurrences: BookingRecord[] = [];
    for (let i = 0; i < input.occurrenceCount; i += 1) {
      const occurrenceStart = computeOccurrenceStart(input.pattern, input.startTime, i);
      const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
      const id = randomUUID();

      // Same raw-SQL insert path as a one-off booking, so the SAME
      // exclusion constraint guards every single occurrence individually -
      // there is no separate "series-aware" concurrency logic to get
      // wrong. Using `tx.$executeRaw` (not `prisma.$executeRaw`) is
      // important here - it runs inside THIS transaction's connection, so
      // a failure on occurrence 5 correctly rolls back occurrences 1-4
      // created earlier in the same loop. Cast to ::timestamp, not
      // ::timestamptz - see the comment on createBooking's own INSERT above.
      await tx.$executeRaw`
        INSERT INTO bookings (id, room_id, user_id, series_id, start_time, end_time, status, created_at, updated_at)
        VALUES (${id}, ${input.roomId}, ${userId}, ${series.id}, ${occurrenceStart}::timestamp, ${occurrenceEnd}::timestamp, 'CONFIRMED', now(), now())
      `;

      occurrences.push({
        id,
        roomId: input.roomId,
        userId,
        seriesId: series.id,
        startTime: occurrenceStart,
        endTime: occurrenceEnd,
        status: 'CONFIRMED',
      });
    }

    return { series, occurrences };
  });
}

// Cancelling ONE occurrence is just cancelBooking() on that occurrence's
// own row - deliberately not a separate code path. Because BookingSeries
// holds no time/status data of its own (see schema.prisma), there is
// nothing here that could accidentally touch sibling occurrences or the
// series row; the isolation is structural, not something this function
// has to carefully enforce.
export const cancelSeriesOccurrence = cancelBooking;
