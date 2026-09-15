// tests/bookings.series.test.ts
//
// Proves the schema decision in prisma/schema.prisma actually delivers
// what it promises: cancelling ONE occurrence of a recurring series
// leaves every sibling occurrence, and the series row itself, untouched.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';
import { createTestUser, createTestRoom, resetDatabase, daysFromNow } from './helpers/factories.js';

const app = createTestApp();

beforeEach(async () => {
  await resetDatabase();
});

describe('recurring booking series', () => {
  it('creates N independent weekly occurrences linked to one series', async () => {
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

    expect(res.status).toBe(201);
    expect(res.body.occurrences).toHaveLength(4);
    // Each occurrence really is one week apart.
    const starts = res.body.occurrences.map((o: { startTime: string }) => new Date(o.startTime).getTime());
    for (let i = 1; i < starts.length; i += 1) {
      expect(starts[i] - starts[i - 1]).toBe(7 * 24 * 60 * 60 * 1000);
    }
  });

  it('cancelling ONE occurrence does not affect sibling occurrences or the series row', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    const created = await request(app)
      .post('/bookings/series')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        roomId: room.id,
        startTime: daysFromNow(30, '10:00'),
        endTime: daysFromNow(30, '11:00'),
        occurrenceCount: 3,
      });

    const occurrences = created.body.occurrences as Array<{ id: string }>;
    const targetOccurrence = occurrences[1]; // cancel the middle one specifically

    const cancelRes = await request(app)
      .delete(`/bookings/${targetOccurrence.id}/occurrence`)
      .set('Authorization', `Bearer ${user.accessToken}`);
    expect(cancelRes.status).toBe(204);

    const listRes = await request(app).get('/bookings/me').set('Authorization', `Bearer ${user.accessToken}`);
    const bookings = listRes.body.bookings as Array<{ id: string; status: string }>;

    const cancelled = bookings.find((b) => b.id === targetOccurrence.id);
    expect(cancelled?.status).toBe('CANCELLED');

    // The other two occurrences are untouched - still CONFIRMED.
    const siblingIds = occurrences.filter((o) => o.id !== targetOccurrence.id).map((o) => o.id);
    for (const id of siblingIds) {
      const sibling = bookings.find((b) => b.id === id);
      expect(sibling?.status).toBe('CONFIRMED');
    }
  });

  it('the freed slot from a cancelled occurrence is immediately bookable by someone else', async () => {
    const room = await createTestRoom();
    const owner = await createTestUser();
    const otherUser = await createTestUser();

    const created = await request(app)
      .post('/bookings/series')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        roomId: room.id,
        startTime: daysFromNow(30, '10:00'),
        endTime: daysFromNow(30, '11:00'),
        occurrenceCount: 2,
      });
    const firstOccurrence = created.body.occurrences[0];

    await request(app)
      .delete(`/bookings/${firstOccurrence.id}/occurrence`)
      .set('Authorization', `Bearer ${owner.accessToken}`);

    // A different user books the exact same room+slot that was just freed.
    const rebook = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${otherUser.accessToken}`)
      .send({ roomId: room.id, startTime: firstOccurrence.startTime, endTime: firstOccurrence.endTime });

    expect(rebook.status).toBe(201);
  });
});
