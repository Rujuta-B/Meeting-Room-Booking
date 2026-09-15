// tests/utilisation.test.ts
//
// Proves the utilisation view is admin-only (authorization enforced
// server-side, per spec section 6) and that its aggregate numbers are
// actually derived from real booking data for the requested range.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';
import { createTestUser, createTestRoom, resetDatabase, daysFromNow } from './helpers/factories.js';

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
});
