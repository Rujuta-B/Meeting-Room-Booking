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
      .query({ startTime: daysFromNow(20, '10:30'), endTime: daysFromNow(20, '10:45'), minCapacity: 2 });

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
      .query({ startTime: daysFromNow(20, '11:00'), endTime: daysFromNow(20, '12:00'), minCapacity: 2 });

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
      .query({ startTime: daysFromNow(20, '10:00'), endTime: daysFromNow(20, '11:00'), minCapacity: 2 });

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
        minCapacity: 2,
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
      .query({ startTime: daysFromNow(20, '10:00'), endTime: daysFromNow(20, '11:00'), minCapacity: 2 });

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

  it('filters by a case-insensitive substring match on name', async () => {
    const user = await createTestUser();
    const match = await createTestRoom({ name: 'Aspen Boardroom' });
    const other = await createTestRoom({ name: 'Birch Suite' });

    const res = await request(app)
      .get('/rooms/search')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({ startTime: daysFromNow(20, '10:00'), endTime: daysFromNow(20, '11:00'), minCapacity: 2, name: 'aspen' });

    const ids = res.body.rooms.map((r: { id: string }) => r.id);
    expect(ids).toContain(match.id);
    expect(ids).not.toContain(other.id);
  });

  it('paginates results and reports the total matching count independent of the page requested', async () => {
    const user = await createTestUser();
    const rooms = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createTestRoom({ name: `Pageable Room ${i}` })),
    );

    const page1 = await request(app)
      .get('/rooms/search')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({
        startTime: daysFromNow(20, '10:00'),
        endTime: daysFromNow(20, '11:00'),
        minCapacity: 2,
        name: 'Pageable Room',
        page: 1,
        pageSize: 2,
      });

    expect(page1.body.rooms).toHaveLength(2);
    expect(page1.body.pagination).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });

    const page3 = await request(app)
      .get('/rooms/search')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({
        startTime: daysFromNow(20, '10:00'),
        endTime: daysFromNow(20, '11:00'),
        minCapacity: 2,
        name: 'Pageable Room',
        page: 3,
        pageSize: 2,
      });

    // 5 rooms, pageSize 2 -> page 3 holds only the 5th, remaining room.
    expect(page3.body.rooms).toHaveLength(1);
    expect(page3.body.pagination.total).toBe(5);

    const allIds = [...page1.body.rooms, ...page3.body.rooms].map((r: { id: string }) => r.id);
    expect(new Set(allIds).size).toBe(3);
    expect(rooms.length).toBe(5);
  });

  it('rejects a pageSize above the maximum', async () => {
    const user = await createTestUser();

    const res = await request(app)
      .get('/rooms/search')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({ startTime: daysFromNow(20, '10:00'), endTime: daysFromNow(20, '11:00'), pageSize: 500 });

    expect(res.status).toBe(400);
  });
});

describe('GET /rooms (catalogue listing)', () => {
  it('paginates and reports total count', async () => {
    const user = await createTestUser();
    await Promise.all(Array.from({ length: 3 }, (_, i) => createTestRoom({ name: `Catalogue Room ${i}` })));

    const res = await request(app)
      .get('/rooms')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({ page: 1, pageSize: 2 });

    expect(res.status).toBe(200);
    expect(res.body.rooms).toHaveLength(2);
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
  });

  it('filters by name substring', async () => {
    const user = await createTestUser();
    const match = await createTestRoom({ name: 'North Wing Suite' });
    const other = await createTestRoom({ name: 'South Wing Suite' });

    const res = await request(app)
      .get('/rooms')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({ name: 'north' });

    const ids = res.body.rooms.map((r: { id: string }) => r.id);
    expect(ids).toContain(match.id);
    expect(ids).not.toContain(other.id);
  });

  it('returns each room\'s floor as a plain number', async () => {
    const user = await createTestUser();
    const room = await createTestRoom({ floor: 7 });

    const res = await request(app)
      .get('/rooms')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .query({ page: 1, pageSize: 100 });

    const found = res.body.rooms.find((r: { id: string }) => r.id === room.id);
    expect(found.floor).toBe(7);
  });
});

describe('GET /rooms/attributes', () => {
  it('returns the full set of admin-defined attributes', async () => {
    const user = await createTestUser();
    await prisma.attribute.create({ data: { name: `projector-${Date.now()}` } });

    const res = await request(app).get('/rooms/attributes').set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.attributes.length).toBeGreaterThan(0);
  });
});

describe('room capacity bounds', () => {
  it('rejects a capacity below 2', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });

    const res = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Too Small', floor: 9, capacity: 1 });

    expect(res.status).toBe(400);
  });

  it('accepts a capacity of exactly 2', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });

    const res = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Min Capacity', floor: 9, capacity: 2 });

    expect(res.status).toBe(201);
    expect(res.body.room.capacity).toBe(2);
  });

  it('rejects a capacity above 500', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });

    const res = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Too Big', floor: 9, capacity: 501 });

    expect(res.status).toBe(400);
  });

  it('accepts a capacity of exactly 500', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });

    const res = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Max Capacity', floor: 9, capacity: 500 });

    expect(res.status).toBe(201);
    expect(res.body.room.capacity).toBe(500);
  });
});

describe('room management authorization', () => {
  it('rejects POST /rooms from a non-admin user with 403', async () => {
    const user = await createTestUser({ role: 'USER' });

    const res = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Sneaky Room', floor: 2, capacity: 10 });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects PATCH /rooms/:id from a non-admin user with 403', async () => {
    const user = await createTestUser({ role: 'USER' });
    const room = await createTestRoom();

    const res = await request(app)
      .patch(`/rooms/${room.id}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Renamed' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects POST /rooms with no auth at all with 401', async () => {
    const res = await request(app).post('/rooms').send({ name: 'Anon Room', floor: 2, capacity: 10 });
    expect(res.status).toBe(401);
  });

  it('rejects PATCH /rooms/:id with no auth at all with 401', async () => {
    const room = await createTestRoom();
    const res = await request(app).patch(`/rooms/${room.id}`).send({ name: 'Anon Rename' });
    expect(res.status).toBe(401);
  });
});

describe('room name+floor uniqueness', () => {
  it('rejects creating a room with the same name and floor as an existing one', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    await createTestRoom({ name: 'Aspen', floor: 3 });

    const res = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Aspen', floor: 3, capacity: 10 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROOM_DUPLICATE');
  });

  it('allows the same name on a different floor', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    await createTestRoom({ name: 'Aspen', floor: 3 });

    const res = await request(app)
      .post('/rooms')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Aspen', floor: 4, capacity: 10 });

    expect(res.status).toBe(201);
  });

  it('rejects updating a room to collide with another existing room', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    await createTestRoom({ name: 'Birch', floor: 2 });
    const roomToRename = await createTestRoom({ name: 'Cedar', floor: 2 });

    const res = await request(app)
      .patch(`/rooms/${roomToRename.id}`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Birch' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROOM_DUPLICATE');
  });
});

describe('GET /rooms booking visibility', () => {
  it('includes a confirmed-booking count per room', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const user = await createTestUser();
    const room = await createTestRoom();

    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: daysFromNow(20, '10:00'), endTime: daysFromNow(20, '11:00') });

    const res = await request(app).get('/rooms').set('Authorization', `Bearer ${admin.accessToken}`);

    const found = res.body.rooms.find((r: { id: string }) => r.id === room.id);
    expect(found._count.bookings).toBe(1);
  });
});

describe('GET /rooms/:id/bookings', () => {
  it('returns the confirmed bookings for a room with the owner email', async () => {
    const user = await createTestUser();
    const room = await createTestRoom();

    await request(app)
      .post('/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ roomId: room.id, startTime: daysFromNow(20, '10:00'), endTime: daysFromNow(20, '11:00') });

    const res = await request(app).get(`/rooms/${room.id}/bookings`).set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.bookings).toHaveLength(1);
    expect(res.body.bookings[0].user.email).toBe(user.email);
  });

  it('returns 404 for a nonexistent room', async () => {
    const user = await createTestUser();

    const res = await request(app)
      .get('/rooms/00000000-0000-0000-0000-000000000000/bookings')
      .set('Authorization', `Bearer ${user.accessToken}`);

    expect(res.status).toBe(404);
  });
});
