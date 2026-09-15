// tests/bookings.ownership.test.ts
//
// Proves "a user can cancel/shorten only their own bookings - including if
// they try to reach someone else's booking directly by its ID" (spec
// section 6) with an actual test, not just a UI check that a determined
// attacker could bypass entirely by calling the API directly - which is
// exactly what this test does: it IS the direct API call.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';
import { createTestUser, createTestRoom, resetDatabase } from './helpers/factories.js';

const app = createTestApp();

beforeEach(async () => {
  await resetDatabase();
});

async function createBookingAs(token: string, roomId: string) {
  const res = await request(app)
    .post('/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({ roomId, startTime: '2026-05-01T10:00:00.000Z', endTime: '2026-05-01T11:00:00.000Z' });
  return res.body.booking;
}

describe('booking ownership enforcement', () => {
  it('returns 403 when a different user tries to cancel someone else\'s booking', async () => {
    const room = await createTestRoom();
    const owner = await createTestUser();
    const attacker = await createTestUser();
    const booking = await createBookingAs(owner.accessToken, room.id);

    const res = await request(app).delete(`/bookings/${booking.id}`).set('Authorization', `Bearer ${attacker.accessToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 403 when a different user tries to shorten someone else\'s booking', async () => {
    const room = await createTestRoom();
    const owner = await createTestUser();
    const attacker = await createTestUser();
    const booking = await createBookingAs(owner.accessToken, room.id);

    const res = await request(app)
      .patch(`/bookings/${booking.id}/shorten`)
      .set('Authorization', `Bearer ${attacker.accessToken}`)
      .send({ endTime: '2026-05-01T10:30:00.000Z' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('returns 404 for a well-formed but nonexistent booking id', async () => {
    const user = await createTestUser();
    const res = await request(app)
      .delete(`/bookings/${crypto.randomUUID()}`)
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('allows the OWNER to cancel their own booking', async () => {
    const room = await createTestRoom();
    const owner = await createTestUser();
    const booking = await createBookingAs(owner.accessToken, room.id);

    const res = await request(app).delete(`/bookings/${booking.id}`).set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(204);
  });

  it('rejects every booking mutation with no auth token at all (no anonymous path)', async () => {
    const room = await createTestRoom();
    const createRes = await request(app)
      .post('/bookings')
      .send({ roomId: room.id, startTime: '2026-05-01T10:00:00.000Z', endTime: '2026-05-01T11:00:00.000Z' });
    expect(createRes.status).toBe(401);

    const cancelRes = await request(app).delete(`/bookings/${crypto.randomUUID()}`);
    expect(cancelRes.status).toBe(401);
  });
});
