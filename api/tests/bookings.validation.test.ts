// tests/bookings.validation.test.ts
//
// Proves bad input is rejected BEFORE it reaches business logic (spec
// section 6): an end-before-start booking or a reference to a nonexistent
// room should never get anywhere near the exclusion constraint / database
// write path at all.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';
import { createTestUser, createTestRoom, resetDatabase, daysFromNow } from './helpers/factories.js';
import { prisma } from '../src/prisma/client.js';
import { randomUUID } from 'node:crypto';

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
      .send({ roomId: room.id, startTime: daysFromNow(5, '11:00'), endTime: daysFromNow(5, '10:00') });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.errors[0].field).toBe('endTime');
  });

  it('rejects a well-formed but nonexistent roomId with a clear error, not a raw DB failure', async () => {
    const user = await createTestUser();

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: crypto.randomUUID(), startTime: daysFromNow(5, '10:00'), endTime: daysFromNow(5, '11:00') });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects a malformed roomId (not even a valid UUID) with a 400', async () => {
    const user = await createTestUser();

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: 'not-a-uuid', startTime: daysFromNow(5, '10:00'), endTime: daysFromNow(5, '11:00') });

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

    // A booking that has already started can never be CREATED directly
    // through POST /bookings (CreateBookingSchema rejects any startTime
    // that isn't in the future) - so the only realistic way such a row
    // exists is a booking that WAS in the future at creation time and has
    // since elapsed. Inserted directly via Prisma to simulate exactly that,
    // rather than waiting in real time for a freshly-created booking to
    // start.
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const pastEnd = new Date(Date.now() + 60 * 60 * 1000);
    const booking = await prisma.booking.create({
      data: {
        id: randomUUID(),
        roomId: room.id,
        userId: user.id,
        startTime: past,
        endTime: pastEnd,
        status: 'CONFIRMED',
      },
    });

    const cancelRes = await request(app)
      .delete(`/bookings/${booking.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(cancelRes.status).toBe(409);
    expect(cancelRes.body.error.code).toBe('BOOKING_ALREADY_STARTED');
  });

  it('allows shortening a booking that has already started, as long as 10+ minutes remain before its current end', async () => {
    // Shorten is deliberately MORE permissive than cancel here: a booking
    // that's already running can still be trimmed, since a shorten (unlike
    // a cancel) leaves an accurate record of what actually happened up to
    // the new end time. See assertShortenableNow in bookings.service.ts.
    const room = await createTestRoom();
    const user = await createTestUser();

    const past = new Date(Date.now() - 15 * 60 * 1000); // started 15 min ago
    const end = new Date(Date.now() + 20 * 60 * 1000); // ends in 20 min - well over the 10-min cutoff
    const booking = await prisma.booking.create({
      data: {
        id: randomUUID(),
        roomId: room.id,
        userId: user.id,
        startTime: past,
        endTime: end,
        status: 'CONFIRMED',
      },
    });

    const newEnd = new Date(Date.now() + 12 * 60 * 1000); // shortened to 12 min from now
    const shortenRes = await request(app)
      .patch(`/bookings/${booking.id}/shorten`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ endTime: newEnd.toISOString() });

    expect(shortenRes.status).toBe(200);
    expect(shortenRes.body.booking.endTime).toBe(newEnd.toISOString());
  });

  it('rejects shortening a booking with fewer than 10 minutes remaining before its current end, with a specific code', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    const past = new Date(Date.now() - 55 * 60 * 1000); // started 55 min ago
    const end = new Date(Date.now() + 5 * 60 * 1000); // ends in 5 min - inside the 10-min cutoff
    const booking = await prisma.booking.create({
      data: {
        id: randomUUID(),
        roomId: room.id,
        userId: user.id,
        startTime: past,
        endTime: end,
        status: 'CONFIRMED',
      },
    });

    const shortenRes = await request(app)
      .patch(`/bookings/${booking.id}/shorten`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ endTime: new Date(Date.now() + 2 * 60 * 1000).toISOString() });

    expect(shortenRes.status).toBe(409);
    expect(shortenRes.body.error.code).toBe('BOOKING_TOO_CLOSE_TO_END');
  });

  it('rejects a booking shorter than 10 minutes', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: daysFromNow(5, '10:00'), endTime: daysFromNow(5, '10:09') });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.errors[0].field).toBe('endTime');
  });

  it('accepts a booking that is exactly 10 minutes long', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    const res = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: daysFromNow(5, '10:00'), endTime: daysFromNow(5, '10:10') });

    expect(res.status).toBe(201);
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
      .send({ roomId: room.id, startTime: daysFromNow(5, '10:00'), endTime: daysFromNow(5, '11:00') });
    expect(created.status).toBe(201);

    // Attempt to move the end time LATER, not earlier.
    const extendRes = await request(app)
      .patch(`/bookings/${created.body.booking.id}/shorten`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ endTime: daysFromNow(5, '12:00') });

    expect(extendRes.status).toBe(400);
    expect(extendRes.body.error.code).toBe('VALIDATION_ERROR');

    // And confirm the booking's endTime was NOT actually changed.
    const listRes = await request(app).get('/bookings/me').set('Authorization', `Bearer ${user.accessToken}`);
    const booking = listRes.body.bookings.find((b: { id: string }) => b.id === created.body.booking.id);
    expect(booking.endTime).toBe(new Date(daysFromNow(5, '11:00')).toISOString());
  });

  it('rejects a "shorten" request with the same endTime as the current one (no-op is not a valid shorten)', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    const created = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: daysFromNow(5, '10:00'), endTime: daysFromNow(5, '11:00') });

    const res = await request(app)
      .patch(`/bookings/${created.body.booking.id}/shorten`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ endTime: daysFromNow(5, '11:00') });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('allows a genuine shorten (new endTime strictly earlier than current)', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    const created = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: daysFromNow(5, '10:00'), endTime: daysFromNow(5, '11:00') });

    const res = await request(app)
      .patch(`/bookings/${created.body.booking.id}/shorten`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ endTime: daysFromNow(5, '10:30') });

    expect(res.status).toBe(200);
    expect(res.body.booking.endTime).toBe(new Date(daysFromNow(5, '10:30')).toISOString());
  });
});

describe('POST /bookings/series validation', () => {
  it('rejects a series request missing the pattern field', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    const res = await request(app)
      .post('/bookings/series')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        roomId: room.id,
        startTime: daysFromNow(30, '10:00'),
        endTime: daysFromNow(30, '11:00'),
        occurrenceCount: 4,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a series request missing occurrenceCount', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    const res = await request(app)
      .post('/bookings/series')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        roomId: room.id,
        pattern: 'WEEKLY',
        startTime: daysFromNow(30, '10:00'),
        endTime: daysFromNow(30, '11:00'),
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a series request with an unrecognized pattern value', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    const res = await request(app)
      .post('/bookings/series')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        roomId: room.id,
        pattern: 'FORTNIGHTLY',
        startTime: daysFromNow(30, '10:00'),
        endTime: daysFromNow(30, '11:00'),
        occurrenceCount: 2,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a series request where the first occurrence has endTime before startTime', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    const res = await request(app)
      .post('/bookings/series')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        roomId: room.id,
        pattern: 'WEEKLY',
        startTime: daysFromNow(30, '11:00'),
        endTime: daysFromNow(30, '10:00'),
        occurrenceCount: 4,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a DAILY series exceeding its 30-occurrence cap with VALIDATION_ERROR', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    const res = await request(app)
      .post('/bookings/series')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        roomId: room.id,
        pattern: 'DAILY',
        startTime: daysFromNow(30, '10:00'),
        endTime: daysFromNow(30, '11:00'),
        occurrenceCount: 31,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a WEEKLY series exceeding its 12-occurrence cap with VALIDATION_ERROR', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    const res = await request(app)
      .post('/bookings/series')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        roomId: room.id,
        pattern: 'WEEKLY',
        startTime: daysFromNow(30, '10:00'),
        endTime: daysFromNow(30, '11:00'),
        occurrenceCount: 13,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
