// tests/utilisation.test.ts
//
// Proves the utilisation view is admin-only (authorization enforced
// server-side, per spec section 6) and that its aggregate numbers are
// actually derived from real booking data for the requested range.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';
import { createTestUser, createTestRoom, resetDatabase } from './helpers/factories.js';

const app = createTestApp();

beforeEach(async () => {
  await resetDatabase();
});

describe('utilisation report', () => {
  it('returns 403 for a non-admin user', async () => {
    const user = await createTestUser({ role: 'USER' });

    const res = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({ rangeStart: '2026-01-01T00:00:00.000Z', rangeEnd: '2026-12-31T00:00:00.000Z' });

    expect(res.status).toBe(403);
  });

  it('returns 401 with no auth at all', async () => {
    const res = await request(app)
      .get('/utilisation')
      .query({ rangeStart: '2026-01-01T00:00:00.000Z', rangeEnd: '2026-12-31T00:00:00.000Z' });

    expect(res.status).toBe(401);
  });

  it('aggregates confirmed booking hours per room per week for an admin', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const user = await createTestUser();
    const room = await createTestRoom();

    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: '2026-08-04T10:00:00.000Z', endTime: '2026-08-04T12:00:00.000Z' }); // 2 hours

    const res = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ rangeStart: '2026-08-01T00:00:00.000Z', rangeEnd: '2026-08-31T00:00:00.000Z' });

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
      .send({ roomId: room.id, startTime: '2026-08-04T10:00:00.000Z', endTime: '2026-08-04T12:00:00.000Z' });
    await request(app).delete(`/bookings/${created.body.booking.id}`).set('Authorization', `Bearer ${user.accessToken}`);

    const res = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ rangeStart: '2026-08-01T00:00:00.000Z', rangeEnd: '2026-08-31T00:00:00.000Z' });

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

    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: '2026-08-31T10:00:00.000Z', endTime: '2026-08-31T11:00:00.000Z' });

    // rangeEnd set to exactly the booking's startTime - EXCLUDED.
    const excluded = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ rangeStart: '2026-08-01T00:00:00.000Z', rangeEnd: '2026-08-31T10:00:00.000Z' });
    expect(excluded.body.report.find((r: { roomId: string }) => r.roomId === room.id)).toBeUndefined();

    // rangeEnd pushed to the start of the NEXT day (the convention the
    // frontend uses) - INCLUDED.
    const included = await request(app)
      .get('/utilisation')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .query({ rangeStart: '2026-08-01T00:00:00.000Z', rangeEnd: '2026-09-01T00:00:00.000Z' });
    expect(included.body.report.find((r: { roomId: string }) => r.roomId === room.id)).toBeDefined();
  });
});
