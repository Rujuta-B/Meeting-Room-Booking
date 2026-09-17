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
import { createTestUser, createTestRoom, resetDatabase, daysFromNow } from './helpers/factories.js';

const app = createTestApp();

beforeEach(async () => {
  await resetDatabase();
});

async function createBookingAs(token: string, roomId: string) {
  const res = await request(app)
    .post('/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({ roomId, startTime: daysFromNow(5, '10:00'), endTime: daysFromNow(5, '11:00') });
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
      .send({ endTime: daysFromNow(5, '10:30') });

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

  it('includes the room name/floor alongside each booking in /bookings/me', async () => {
    const room = await createTestRoom({ name: 'Sunflower', floor: 3 });
    const owner = await createTestUser();
    await createBookingAs(owner.accessToken, room.id);

    const res = await request(app).get('/bookings/me').set('Authorization', `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.bookings[0].room).toEqual({ name: 'Sunflower', floor: 3 });
  });

  it('rejects every booking mutation with no auth token at all (no anonymous path)', async () => {
    const room = await createTestRoom();
    const createRes = await request(app)
      .post('/bookings')
      .send({ roomId: room.id, startTime: daysFromNow(5, '10:00'), endTime: daysFromNow(5, '11:00') });
    expect(createRes.status).toBe(401);

    const cancelRes = await request(app).delete(`/bookings/${crypto.randomUUID()}`);
    expect(cancelRes.status).toBe(401);
  });
});
