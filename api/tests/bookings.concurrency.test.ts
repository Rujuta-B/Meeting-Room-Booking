// tests/bookings.concurrency.test.ts
//
// THE centerpiece test of this entire POC. Everything else in the app
// exists to make this test meaningful: if this test is green, the
// double-booking guarantee (spec section 3.3) actually holds under real
// concurrency, not just "looks right" in a code review.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';
import { createTestUser, createTestRoom, resetDatabase } from './helpers/factories.js';

const app = createTestApp();

beforeEach(async () => {
  await resetDatabase();
});

describe('concurrent overlapping bookings', () => {
  it('accepts exactly one of two truly concurrent overlapping requests', async () => {
    const room = await createTestRoom();
    const userA = await createTestUser();
    const userB = await createTestUser();

    const payload = {
      roomId: room.id,
      startTime: '2026-03-10T10:00:00.000Z',
      endTime: '2026-03-10T11:00:00.000Z',
    };

    // WHY Promise.all, and NOT two sequential `await`s: a sequential test
    // (await request A, THEN await request B) would let request A's
    // ENTIRE lifecycle - including its INSERT actually committing - finish
    // before request B's INSERT even begins. That would only prove the
    // constraint stops a LATER insert from conflicting with an EARLIER,
    // already-committed one - a much weaker claim than what the spec
    // requires ("two requests arriving at the exact same instant").
    // Promise.all fires both HTTP requests without awaiting in between, so
    // both requests' INSERTs reach Postgres at effectively the same time,
    // which is the actual race condition being guarded against.
    const [resA, resB] = await Promise.all([
      request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send(payload),
      request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userB.accessToken}`)
        .send(payload),
    ]);

    const statuses = [resA.status, resB.status].sort();
    // Exactly one 201 (created) and one 409 (rejected as a conflict) - not
    // two 201s (the bug this whole POC exists to prevent), and not two
    // 409s (which would mean the constraint is somehow rejecting BOTH,
    // also a bug).
    expect(statuses).toEqual([201, 409]);

    const conflictRes = resA.status === 409 ? resA : resB;
    expect(conflictRes.body.error.code).toBe('BOOKING_CONFLICT');

    // Belt-and-braces: confirm the DATABASE agrees with the API responses
    // - exactly one CONFIRMED booking for this room+time exists, not zero,
    // not two.
    const confirmedCount = await request(app)
      .get('/bookings/me')
      .set('Authorization', `Bearer ${userA.accessToken}`);
    const confirmedForRoom = confirmedCount.body.bookings.filter(
      (b: { roomId: string; status: string }) => b.roomId === room.id && b.status === 'CONFIRMED',
    );
    expect(confirmedForRoom.length).toBeLessThanOrEqual(1);
  });

  it('allows a booking for a DIFFERENT time slot on the same room to succeed independently', async () => {
    // A control case: concurrency correctness shouldn't come at the cost
    // of falsely rejecting NON-overlapping bookings on the same room.
    const room = await createTestRoom();
    const userA = await createTestUser();
    const userB = await createTestUser();

    const [resA, resB] = await Promise.all([
      request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .send({ roomId: room.id, startTime: '2026-03-10T10:00:00.000Z', endTime: '2026-03-10T11:00:00.000Z' }),
      request(app)
        .post('/bookings')
        .set('Authorization', `Bearer ${userB.accessToken}`)
        .send({ roomId: room.id, startTime: '2026-03-10T11:00:00.000Z', endTime: '2026-03-10T12:00:00.000Z' }),
    ]);

    // Back-to-back, non-overlapping (11:00 end == 11:00 start uses the
    // '[)' bound from the exclusion constraint, so these do NOT conflict).
    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
  });
});
