// tests/utilisation.test.ts
//
// Proves the utilisation view is admin-only (authorization enforced
// server-side, per spec section 6) and that its aggregate numbers are
// actually derived from real booking data for the requested range.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';
import { createTestUser, createTestRoom, resetDatabase, daysFromNow } from './helpers/factories.js';
import { createBooking } from '../src/modules/bookings/bookings.service.js';

const app = createTestApp();

// A wide window ([-1 day, +1 year)) around "now" that safely contains
// every relative booking time this file creates (via daysFromNow),
// regardless of when the suite actually runs - see daysFromNow's own
// comment in helpers/factories.ts for why fixed calendar dates can't be
// used here.
const REPORT_RANGE_START = daysFromNow(-1, '00:00');
const REPORT_RANGE_END = daysFromNow(365, '00:00');

beforeEach(async () => {
  await resetDatabase();
});

describe('utilisation report', () => {
  it('returns 403 for a non-admin user', async () => {
    const user = await createTestUser({ role: 'USER' });

    const res = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({ rangeStart: REPORT_RANGE_START, rangeEnd: REPORT_RANGE_END });

    expect(res.status).toBe(403);
  });

  it('returns 401 with no auth at all', async () => {
    const res = await request(app)
      .get('/utilisation')
      .query({ rangeStart: REPORT_RANGE_START, rangeEnd: REPORT_RANGE_END });

    expect(res.status).toBe(401);
  });

  it('aggregates confirmed booking hours per room per week for an admin', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const user = await createTestUser();
    const room = await createTestRoom();

    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: daysFromNow(10, '10:00'), endTime: daysFromNow(10, '12:00') }); // 2 hours

    const res = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ rangeStart: REPORT_RANGE_START, rangeEnd: REPORT_RANGE_END });

    expect(res.status).toBe(200);
    const row = res.body.report.find((r: { roomId: string }) => r.roomId === room.id);
    expect(row).toBeDefined();
    expect(row.hoursBooked).toBe(2);
  });

  it('excludes cancelled bookings from the aggregate', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const user = await createTestUser();
    const room = await createTestRoom();

    const created = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: daysFromNow(10, '10:00'), endTime: daysFromNow(10, '12:00') });
    await request(app).delete(`/bookings/${created.body.booking.id}`).set('Authorization', `Bearer ${user.accessToken}`);

    const res = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ rangeStart: REPORT_RANGE_START, rangeEnd: REPORT_RANGE_END });

    const row = res.body.report.find((r: { roomId: string }) => r.roomId === room.id);
    expect(row).toBeUndefined();
  });

  it('rangeEnd is an EXCLUSIVE bound - a booking starting exactly at rangeEnd is not included', async () => {
    // Documents the exact boundary behavior (start_time < rangeEnd, not
    // <=) so it's explicit and tested, not just implied by the SQL. The
    // frontend (AdminUtilisationPage.jsx) compensates for this by sending
    // "start of the day AFTER the picked end date" as rangeEnd, so an
    // admin's inclusive "To" date selection still gets what they expect -
    // this test guards the underlying exclusive-bound contract that
    // compensation relies on.
    const admin = await createTestUser({ role: 'ADMIN' });
    const user = await createTestUser();
    const room = await createTestRoom();

    const bookingStart = daysFromNow(10, '10:00');
    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: bookingStart, endTime: daysFromNow(10, '11:00') });

    // rangeEnd set to exactly the booking's startTime - EXCLUDED.
    const excluded = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ rangeStart: REPORT_RANGE_START, rangeEnd: bookingStart });
    expect(excluded.body.report.find((r: { roomId: string }) => r.roomId === room.id)).toBeUndefined();

    // rangeEnd pushed one hour later (the booking has already started by
    // then) - INCLUDED.
    const included = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ rangeStart: REPORT_RANGE_START, rangeEnd: daysFromNow(10, '11:00') });
    expect(included.body.report.find((r: { roomId: string }) => r.roomId === room.id)).toBeDefined();
  });

  it('filters the report down to a single room via roomId', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const user = await createTestUser();
    const roomA = await createTestRoom();
    const roomB = await createTestRoom();

    for (const room of [roomA, roomB]) {
      await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ roomId: room.id, startTime: daysFromNow(10, '10:00'), endTime: daysFromNow(10, '11:00') });
    }

    const res = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ rangeStart: REPORT_RANGE_START, rangeEnd: REPORT_RANGE_END, roomId: roomA.id });

    const roomIds = new Set(res.body.report.map((r: { roomId: string }) => r.roomId));
    expect(roomIds).toEqual(new Set([roomA.id]));
  });

  it('paginates the report and reports the total row count independent of the page requested', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const user = await createTestUser();
    // 3 rooms, each with one CONFIRMED booking in-range -> 3 report rows.
    const rooms = await Promise.all(Array.from({ length: 3 }, () => createTestRoom()));
    for (const room of rooms) {
      await request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ roomId: room.id, startTime: daysFromNow(10, '10:00'), endTime: daysFromNow(10, '11:00') });
    }

    const res = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ rangeStart: REPORT_RANGE_START, rangeEnd: REPORT_RANGE_END, page: 1, pageSize: 2 });

    expect(res.body.report).toHaveLength(2);
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
  });

  it('a booking created via the raw-SQL INSERT round-trips to the exact intended UTC instant', async () => {
    // Regression test for the ::timestamptz-vs-::timestamp cast bug: since
    // start_time/end_time are plain `timestamp` columns, createBooking()'s
    // raw INSERT must cast to ::timestamp, not ::timestamptz - the latter
    // would silently shift the stored value by the Postgres session's
    // timezone offset. This exercises that exact INSERT (not the typed
    // prisma.booking.create() other tests use) and confirms the value that
    // comes back out via the utilisation report is bit-for-bit the instant
    // that was requested.
    const admin = await createTestUser({ role: 'ADMIN' });
    const user = await createTestUser();
    const room = await createTestRoom();

    const startTime = new Date(daysFromNow(10, '10:00'));
    const endTime = new Date(daysFromNow(10, '12:15'));
    await createBooking(user.id, { roomId: room.id, startTime, endTime });

    const res = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ rangeStart: REPORT_RANGE_START, rangeEnd: REPORT_RANGE_END });

    const row = res.body.report.find((r: { roomId: string }) => r.roomId === room.id);
    expect(row).toBeDefined();
    expect(row.hoursBooked).toBe(2.25);
  });

  it('groups a booking by its IST week, not its UTC week', async () => {
    // 2026-06-01 is a Monday. 2026-06-01T19:00:00.000Z is 2026-06-02T00:30
    // IST - already Tuesday in IST, but still Monday night in UTC. The IST
    // week containing that IST-Tuesday starts IST midnight on IST-Monday
    // 2026-06-01, i.e. 2026-05-31T18:30:00.000Z. The UTC week containing
    // this same instant instead starts UTC midnight on UTC-Monday
    // 2026-06-01, i.e. 2026-06-01T00:00:00.000Z - a DIFFERENT instant. If
    // week grouping used raw UTC calendar weeks instead of the documented
    // IST shift, this booking would be reported under that UTC week start
    // rather than the correct IST one - asserting the exact ISO value pins
    // down which one actually happened.
    const admin = await createTestUser({ role: 'ADMIN' });
    const user = await createTestUser();
    const room = await createTestRoom();

    const startTime = new Date('2026-06-01T19:00:00.000Z');
    const endTime = new Date('2026-06-01T20:00:00.000Z');
    await createBooking(user.id, { roomId: room.id, startTime, endTime });

    const res = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ rangeStart: '2026-05-01T00:00:00.000Z', rangeEnd: '2026-07-01T00:00:00.000Z' });

    const row = res.body.report.find((r: { roomId: string }) => r.roomId === room.id);
    expect(row).toBeDefined();
    expect(row.weekStart).toBe('2026-05-31T18:30:00.000Z');
  });

  // The IST week starting IST-Monday 2026-06-01 00:00 runs from
  // 2026-05-31T18:30:00.000Z (inclusive) to 2026-06-07T18:30:00.000Z
  // (exclusive) - the same week the existing IST-grouping test above pins
  // down. Reused here as a fixed, known-full week to test hoursAvailable
  // against, rather than daysFromNow's "relative to whenever the suite
  // runs" times, which can't be lined up to exact week/day boundaries.
  const IST_WEEK_START = '2026-05-31T18:30:00.000Z';
  const IST_WEEK_END = '2026-06-07T18:30:00.000Z';

  it('hoursAvailable is a full 168 (24x7) for a range spanning exactly one full IST week', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const user = await createTestUser();
    const room = await createTestRoom();

    await createBooking(user.id, {
      roomId: room.id,
      startTime: new Date('2026-06-01T10:00:00.000Z'),
      endTime: new Date('2026-06-01T12:00:00.000Z'),
    });

    const res = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ rangeStart: IST_WEEK_START, rangeEnd: IST_WEEK_END });

    const row = res.body.report.find((r: { roomId: string }) => r.roomId === room.id);
    expect(row).toBeDefined();
    expect(row.hoursAvailable).toBe(168);
    expect(row.utilisationPct).toBe(1.2); // 2 / 168 hours, rounded to one decimal
  });

  it('hoursAvailable is 24 for a range spanning exactly one day', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const user = await createTestUser();
    const room = await createTestRoom();

    await createBooking(user.id, {
      roomId: room.id,
      startTime: new Date('2026-06-01T10:00:00.000Z'),
      endTime: new Date('2026-06-01T12:00:00.000Z'),
    });

    // One IST calendar day: 2026-06-01T18:30:00.000Z (IST midnight of
    // 2026-06-02) is excluded, matching the exclusive rangeEnd bound.
    const res = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ rangeStart: '2026-05-31T18:30:00.000Z', rangeEnd: '2026-06-01T18:30:00.000Z' });

    const row = res.body.report.find((r: { roomId: string }) => r.roomId === room.id);
    expect(row).toBeDefined();
    expect(row.hoursAvailable).toBe(24);
  });

  it('clamps hoursAvailable to the requested range for a partial first/last week', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const user = await createTestUser();
    const room = await createTestRoom();

    // A booking on IST-Wednesday 2026-06-03, inside the requested partial
    // week below.
    await createBooking(user.id, {
      roomId: room.id,
      startTime: new Date('2026-06-03T10:00:00.000Z'),
      endTime: new Date('2026-06-03T11:00:00.000Z'),
    });

    // Range starts mid-week: IST-Wednesday 2026-06-03 00:00 IST
    // (2026-06-02T18:30:00.000Z) through the IST week's natural end
    // (2026-06-07T18:30:00.000Z, exclusive) - only Wed/Thu/Fri/Sat/Sun of
    // that IST week are actually requested, i.e. 5 days = 120 hours, not
    // the full week's 168.
    const rangeStart = '2026-06-02T18:30:00.000Z';
    const res = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ rangeStart, rangeEnd: IST_WEEK_END });

    const row = res.body.report.find((r: { roomId: string }) => r.roomId === room.id);
    expect(row).toBeDefined();
    expect(row.weekStart).toBe(IST_WEEK_START); // date_trunc still labels the row by the full week's Monday
    expect(row.hoursAvailable).toBe(120); // only the 5 requested days of that week
  });

  it('a wide multi-month range gives every returned (booked) week its own full 168-hour availability', async () => {
    // Mirrors a monthly recurring series spanning many months: each
    // occurrence lands in a different, mostly-empty week, but any week
    // that DOES have a booking should report a full week's availability
    // (168) since the whole requested range is far wider than any single
    // week and every returned week here is entirely inside it - not the
    // old flat "40" that had nothing to do with the actual monthly
    // cadence.
    const admin = await createTestUser({ role: 'ADMIN' });
    const user = await createTestUser();
    const room = await createTestRoom();

    const occurrenceStarts = [
      '2026-06-01T10:00:00.000Z',
      '2026-07-01T10:00:00.000Z',
      '2026-08-03T10:00:00.000Z', // 2026-08-01/02 fall on a weekend; nudged to the following Monday
    ];
    for (const start of occurrenceStarts) {
      const startTime = new Date(start);
      const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour
      await createBooking(user.id, { roomId: room.id, startTime, endTime });
    }

    const res = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ rangeStart: '2026-05-01T00:00:00.000Z', rangeEnd: '2026-12-01T00:00:00.000Z', pageSize: 100 });

    const rows = res.body.report.filter((r: { roomId: string }) => r.roomId === room.id);
    expect(rows).toHaveLength(3); // one row per distinct week that actually has a booking
    for (const row of rows) {
      expect(row.hoursAvailable).toBe(168);
      expect(row.hoursBooked).toBe(1);
    }
  });
});

describe('day timeline', () => {
  it('returns 403 for a non-admin user', async () => {
    const user = await createTestUser({ role: 'USER' });
    const room = await createTestRoom();

    const res = await request(app)
      .get('/utilisation/day-timeline')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({ roomId: room.id, date: daysFromNow(10, '00:00') });

    expect(res.status).toBe(403);
  });

  it('returns 401 with no auth at all', async () => {
    const room = await createTestRoom();

    const res = await request(app)
      .get('/utilisation/day-timeline')
      .query({ roomId: room.id, date: daysFromNow(10, '00:00') });

    expect(res.status).toBe(401);
  });

  it('returns only bookings overlapping the requested day for the requested room', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const user = await createTestUser();
    const room = await createTestRoom();

    const targetDayBooking = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: daysFromNow(10, '10:00'), endTime: daysFromNow(10, '11:00') });

    // A booking on the adjacent day - must NOT appear in the target day's timeline.
    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: daysFromNow(11, '10:00'), endTime: daysFromNow(11, '11:00') });

    const res = await request(app)
      .get('/utilisation/day-timeline')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ roomId: room.id, date: daysFromNow(10, '00:00') });

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(1);
    expect(res.body.slots[0].bookingId).toBe(targetDayBooking.body.booking.id);
  });

  it('includes a booking that starts the prior day and ends after midnight into the target day', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const user = await createTestUser();
    const room = await createTestRoom();

    // Starts 23:00 on day 9, ends 01:00 on day 10 - overlaps day 10's window.
    const overnightBooking = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: daysFromNow(9, '23:00'), endTime: daysFromNow(10, '01:00') });

    const res = await request(app)
      .get('/utilisation/day-timeline')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ roomId: room.id, date: daysFromNow(10, '00:00') });

    expect(res.body.slots.map((s: { bookingId: string }) => s.bookingId)).toContain(overnightBooking.body.booking.id);
  });

  it('returns no slots for a room/date with no confirmed bookings', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const room = await createTestRoom();

    const res = await request(app)
      .get('/utilisation/day-timeline')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ roomId: room.id, date: daysFromNow(10, '00:00') });

    expect(res.body.slots).toEqual([]);
  });
});
