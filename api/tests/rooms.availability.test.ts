// tests/rooms.availability.test.ts
//
// Proves the availability search is a REAL database query over booking
// data (returns different results as bookings change) and correctly
// applies capacity + attribute filters - not a client-side filter over
// "all rooms" (spec section 6).
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from './helpers/testApp.js';
import { createTestUser, createTestRoom, resetDatabase, daysFromNow } from './helpers/factories.js';
import { prisma } from '../src/prisma/client.js';

const app = createTestApp();

beforeEach(async () => {
  await resetDatabase();
});

describe('room availability search', () => {
  it('excludes a room that has a CONFIRMED booking overlapping the requested window', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: daysFromNow(20, '10:00'), endTime: daysFromNow(20, '11:00') });

    const res = await request(app)
      .get('/rooms/search')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({ startTime: daysFromNow(20, '10:30'), endTime: daysFromNow(20, '10:45'), minCapacity: 1 });

    expect(res.status).toBe(200);
    expect(res.body.rooms.find((r: { id: string }) => r.id === room.id)).toBeUndefined();
  });

  it('includes a room whose only booking does NOT overlap the requested window', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: daysFromNow(20, '10:00'), endTime: daysFromNow(20, '11:00') });

    const res = await request(app)
      .get('/rooms/search')
      .set('Authorization', `Bearer ${user.accessToken}`)
      // Requests the slot right after the existing booking ends - '[)' bound
      // means 11:00-12:00 does NOT overlap a booking ending at 11:00.
      .query({ startTime: daysFromNow(20, '11:00'), endTime: daysFromNow(20, '12:00'), minCapacity: 1 });

    expect(res.status).toBe(200);
    expect(res.body.rooms.find((r: { id: string }) => r.id === room.id)).toBeDefined();
  });

  it('a cancelled booking does not block the room in search results', async () => {
    const room = await createTestRoom();
    const user = await createTestUser();

    const created = await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: daysFromNow(20, '10:00'), endTime: daysFromNow(20, '11:00') });

    await request(app).delete(`/bookings/${created.body.booking.id}`).set('Authorization', `Bearer ${user.accessToken}`);

    const res = await request(app)
      .get('/rooms/search')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({ startTime: daysFromNow(20, '10:00'), endTime: daysFromNow(20, '11:00'), minCapacity: 1 });

    expect(res.body.rooms.find((r: { id: string }) => r.id === room.id)).toBeDefined();
  });

  it('filters out rooms below the requested minimum capacity', async () => {
    const smallRoom = await createTestRoom({ capacity: 2 });
    const bigRoom = await createTestRoom({ capacity: 20 });
    const user = await createTestUser();

    const res = await request(app)
      .get('/rooms/search')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({ startTime: daysFromNow(20, '10:00'), endTime: daysFromNow(20, '11:00'), minCapacity: 10 });

    const ids = res.body.rooms.map((r: { id: string }) => r.id);
    expect(ids).not.toContain(smallRoom.id);
    expect(ids).toContain(bigRoom.id);
  });

  it('filters rooms that must have ALL requested attributes (AND semantics, not OR)', async () => {
    const user = await createTestUser();
    const projector = await prisma.attribute.create({ data: { name: `projector-${Date.now()}` } });
    const whiteboard = await prisma.attribute.create({ data: { name: `whiteboard-${Date.now()}` } });

    const roomWithBoth = await createTestRoom();
    const roomWithOne = await createTestRoom();

    await prisma.roomAttribute.createMany({
      data: [
        { roomId: roomWithBoth.id, attributeId: projector.id },
        { roomId: roomWithBoth.id, attributeId: whiteboard.id },
        { roomId: roomWithOne.id, attributeId: projector.id },
      ],
    });

    const res = await request(app)
      .get('/rooms/search')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({
        startTime: daysFromNow(20, '10:00'),
        endTime: daysFromNow(20, '11:00'),
        minCapacity: 1,
        attributes: `${projector.name},${whiteboard.name}`,
      });

    const ids = res.body.rooms.map((r: { id: string }) => r.id);
    expect(ids).toContain(roomWithBoth.id);
    expect(ids).not.toContain(roomWithOne.id);
  });

  it('includes each room\'s attribute names in the search response', async () => {
    const user = await createTestUser();
    const projector = await prisma.attribute.create({ data: { name: `projector-${Date.now()}` } });
    const room = await createTestRoom();
    await prisma.roomAttribute.create({ data: { roomId: room.id, attributeId: projector.id } });

    const res = await request(app)
      .get('/rooms/search')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({ startTime: daysFromNow(20, '10:00'), endTime: daysFromNow(20, '11:00'), minCapacity: 1 });

    const found = res.body.rooms.find((r: { id: string }) => r.id === room.id);
    expect(found.attributes).toContain(projector.name);
  });

  it('rejects a search where endTime is before startTime', async () => {
    const user = await createTestUser();

    const res = await request(app)
      .get('/rooms/search')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({ startTime: daysFromNow(20, '11:00'), endTime: daysFromNow(20, '10:00') });

    expect(res.status).toBe(400);
  });
});
