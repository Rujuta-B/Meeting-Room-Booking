// tests/bookings.validation.test.ts
//
// Proves bad input is rejected BEFORE it reaches business logic (spec
// section 6): an end-before-start booking or a reference to a nonexistent
// room should never get anywhere near the exclusion constraint / database
// write path at all.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';
import { createTestUser, createTestRoom, resetDatabase } from './helpers/factories.js';

const app = createTestApp();

beforeEach(async () => {
  await resetDatabase();
});

describe('booking input validation', () => {
  it('rejects endTime before startTime with a 400 before touching the database', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: '2026-05-01T11:00:00.000Z', endTime: '2026-05-01T10:00:00.000Z' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.errors[0].field).toBe('endTime');
  });

  it('rejects a well-formed but nonexistent roomId with a clear error, not a raw DB failure', async () => {
    const user = await createTestUser();

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: crypto.randomUUID(), startTime: '2026-05-01T10:00:00.000Z', endTime: '2026-05-01T11:00:00.000Z' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects a malformed roomId (not even a valid UUID) with a 400', async () => {
    const user = await createTestUser();

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: 'not-a-uuid', startTime: '2026-05-01T10:00:00.000Z', endTime: '2026-05-01T11:00:00.000Z' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a booking with missing required fields', async () => {
    const user = await createTestUser();

    const res = await request(app).post('/bookings').set('Authorization', `Bearer ${user.accessToken}`).send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects shortening/cancelling a booking that has already started, with a specific code', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    // A booking that started in the past relative to "now" at test time.
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const pastEnd = new Date(Date.now() + 60 * 60 * 1000);
    const created = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: past.toISOString(), endTime: pastEnd.toISOString() });
    expect(created.status).toBe(201);

    const cancelRes = await request(app)
      .delete(`/bookings/${created.body.booking.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(cancelRes.status).toBe(409);
    expect(cancelRes.body.error.code).toBe('BOOKING_ALREADY_STARTED');
  });

  it('rejects an attempt to EXTEND a booking through the /shorten endpoint', async () => {
    // The endpoint is named "shorten" for a reason - it must not silently
    // accept a new endTime that's LATER than the current one, which would
    // actually be an extension. This directly guards the fix for a real
    // bug found during review: shortenBooking() originally only checked
    // that the new endTime was after the booking's startTime, never that
    // it was actually earlier than the CURRENT endTime.
    const room = await createTestRoom();
    const user = await createTestUser();

    const created = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: '2026-05-01T10:00:00.000Z', endTime: '2026-05-01T11:00:00.000Z' });
    expect(created.status).toBe(201);

    // Attempt to move the end time LATER, not earlier.
    const extendRes = await request(app)
      .patch(`/bookings/${created.body.booking.id}/shorten`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ endTime: '2026-05-01T12:00:00.000Z' });

    expect(extendRes.status).toBe(400);
    expect(extendRes.body.error.code).toBe('VALIDATION_ERROR');

    // And confirm the booking's endTime was NOT actually changed.
    const listRes = await request(app).get('/bookings/me').set('Authorization', `Bearer ${user.accessToken}`);
    const booking = listRes.body.bookings.find((b: { id: string }) => b.id === created.body.booking.id);
    expect(booking.endTime).toBe('2026-05-01T11:00:00.000Z');
  });

  it('rejects a "shorten" request with the same endTime as the current one (no-op is not a valid shorten)', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    const created = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: '2026-05-01T10:00:00.000Z', endTime: '2026-05-01T11:00:00.000Z' });

    const res = await request(app)
      .patch(`/bookings/${created.body.booking.id}/shorten`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ endTime: '2026-05-01T11:00:00.000Z' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('allows a genuine shorten (new endTime strictly earlier than current)', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    const created = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: '2026-05-01T10:00:00.000Z', endTime: '2026-05-01T11:00:00.000Z' });

    const res = await request(app)
      .patch(`/bookings/${created.body.booking.id}/shorten`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ endTime: '2026-05-01T10:30:00.000Z' });

    expect(res.status).toBe(200);
    expect(res.body.booking.endTime).toBe('2026-05-01T10:30:00.000Z');
  });
});
