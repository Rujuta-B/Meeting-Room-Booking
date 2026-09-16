// src/modules/rooms/rooms.service.ts
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma/client.js';
import { NotFoundError } from '../../lib/errors.js';
import type { CreateRoomInput, UpdateRoomInput, SearchAvailabilityInput, ListRoomsQueryInput } from './rooms.schemas.js';

export interface ListRoomsResult {
  rooms: Awaited<ReturnType<typeof prisma.room.findMany>>;
  total: number;
}

export async function listRooms(input: ListRoomsQueryInput): Promise<ListRoomsResult> {
  // name matches against room name OR location, case-insensitively - a
  // real WHERE clause evaluated by Postgres, not "fetch every room and
  // filter in JS" (the anti-pattern the spec forbids for room search).
  const where: Prisma.RoomWhereInput | undefined = input.name
    ? { OR: [{ name: { contains: input.name, mode: 'insensitive' } }, { location: { contains: input.name, mode: 'insensitive' } }] }
    : undefined;

  const [rooms, total] = await Promise.all([
    prisma.room.findMany({
      where,
      include: { attributes: { include: { attribute: true } } },
      orderBy: { name: 'asc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.room.count({ where }),
  ]);

  return { rooms, total };
}

export async function listAttributes() {
  return prisma.attribute.findMany({ orderBy: { name: 'asc' } });
}

export async function createRoom(input: CreateRoomInput) {
  return prisma.$transaction(async (tx) => {
    const room = await tx.room.create({
      data: { name: input.name, location: input.location, capacity: input.capacity },
    });

    for (const attrName of input.attributes) {
      // upsert: reuse the Attribute row if an admin already created
      // "projector" for a different room, otherwise create it. This is
      // what keeps the attribute list centrally normalized instead of
      // accumulating duplicate near-identical strings per room.
      const attribute = await tx.attribute.upsert({
        where: { name: attrName },
        create: { name: attrName },
        update: {},
      });
      await tx.roomAttribute.create({ data: { roomId: room.id, attributeId: attribute.id } });
    }

    return tx.room.findUniqueOrThrow({
      where: { id: room.id },
      include: { attributes: { include: { attribute: true } } },
    });
  });
}

export async function updateRoom(roomId: string, input: UpdateRoomInput) {
  const existing = await prisma.room.findUnique({ where: { id: roomId } });
  if (!existing) throw new NotFoundError('Room');

  return prisma.$transaction(async (tx) => {
    await tx.room.update({
      where: { id: roomId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      },
    });

    if (input.attributes !== undefined) {
      // Simplest-to-reason-about approach for a POC: replace the whole
      // attribute set rather than diffing add/remove. Room attribute lists
      // are small, so this isn't a performance concern, and it avoids a
      // whole class of "did I remove the right ones" bugs.
      await tx.roomAttribute.deleteMany({ where: { roomId } });
      for (const attrName of input.attributes) {
        const attribute = await tx.attribute.upsert({
          where: { name: attrName },
          create: { name: attrName },
          update: {},
        });
        await tx.roomAttribute.create({ data: { roomId, attributeId: attribute.id } });
      }
    }

    return tx.room.findUniqueOrThrow({
      where: { id: roomId },
      include: { attributes: { include: { attribute: true } } },
    });
  });
}

interface AvailableRoomRow {
  id: string;
  name: string;
  location: string;
  capacity: number;
  total_count: bigint;
}

export interface AvailableRoomResult {
  id: string;
  name: string;
  location: string;
  capacity: number;
  attributes: string[];
}

export interface SearchAvailableRoomsResult {
  rooms: AvailableRoomResult[];
  total: number;
}

// WHY this is raw SQL, not Prisma's query builder - see the plan (§4) for
// the full reasoning. Short version: "rooms with NO overlapping CONFIRMED
// booking in this exact window" is a correlated NOT EXISTS with a Postgres
// range-overlap operator (&&) that Prisma's builder simply cannot express.
// Building this through the builder would mean fetching bookings and
// filtering in JS - exactly the "client-side filter over all rooms"
// anti-pattern the spec explicitly forbids.
export async function searchAvailableRooms(input: SearchAvailabilityInput): Promise<SearchAvailableRoomsResult> {
  const attributeNames = input.attributes;

  // Resolve attribute NAMES to ids first (small lookup table, negligible
  // cost) so the main query can filter by attribute_id, which is what the
  // room_attributes(attribute_id) index actually supports.
  const attributeIds =
    attributeNames.length > 0
      ? (await prisma.attribute.findMany({ where: { name: { in: attributeNames } }, select: { id: true } })).map((a) => a.id)
      : [];

  // If the caller asked for attributes that don't exist at all, no room
  // can possibly have them - short-circuit rather than run a query that
  // would (correctly, but pointlessly) return everything because
  // attributeCount = 0.
  if (attributeNames.length > 0 && attributeIds.length < attributeNames.length) {
    return { rooms: [], total: 0 };
  }

  const namePattern = input.name ? `%${input.name}%` : null;
  const offset = (input.page - 1) * input.pageSize;

  // The overlap check below uses tsrange (NOT tstzrange) against a plain
  // ::timestamp cast, deliberately mirroring the EXCLUDE constraint's own
  // expression (see the exclusion-constraint migration's comment on
  // SQLSTATE 42P17): start_time/end_time are plain timestamp columns with
  // no time zone, so casting to tstzrange would apply a
  // session-timezone-dependent conversion that the constraint itself
  // deliberately avoids. If this ever drifted from the constraint's own
  // bound semantics, the search results and the DB-enforced guarantee
  // could silently disagree on what "overlap" means.
  //
  // total_count uses COUNT(*) OVER() - a window function that returns the
  // FULL matching row count on every row of this same query, so pagination
  // metadata comes from one query instead of a second round-trip COUNT(*)
  // against the same WHERE/NOT EXISTS logic.
  const rooms = await prisma.$queryRaw<AvailableRoomRow[]>`
    SELECT r.id, r.name, r.location, r.capacity, COUNT(*) OVER() AS total_count
    FROM rooms r
    WHERE r.capacity >= ${input.minCapacity}
      AND (${namePattern}::text IS NULL OR r.name ILIKE ${namePattern} OR r.location ILIKE ${namePattern})
      AND NOT EXISTS (
        SELECT 1 FROM bookings b
        WHERE b.room_id = r.id
          AND b.status = 'CONFIRMED'
          -- '[)' bound: inclusive start, exclusive end - a booking ending
          -- at 11:00 does not overlap one starting at 11:00. Matches the
          -- exact bound used by the EXCLUDE constraint itself, so this
          -- search query and the DB-enforced guarantee agree on what
          -- "overlap" means.
          AND tsrange(b.start_time, b.end_time, '[)') && tsrange(${input.startTime}::timestamp, ${input.endTime}::timestamp, '[)')
      )
      AND (
        ${attributeIds.length} = 0
        OR r.id IN (
          SELECT ra.room_id FROM room_attributes ra
          WHERE ra.attribute_id = ANY(${attributeIds}::text[])
          GROUP BY ra.room_id
          HAVING COUNT(DISTINCT ra.attribute_id) = ${attributeIds.length}
        )
      )
    ORDER BY r.name
    LIMIT ${input.pageSize}
    OFFSET ${offset};
  `;

  if (rooms.length === 0) return { rooms: [], total: 0 };

  const total = Number(rooms[0].total_count);

  // A second, tiny query keyed by the room ids the first query already
  // narrowed down to - not a per-room query in a loop, and not fetching
  // every room's attributes up front only to discard most of them.
  const roomAttributeRows = await prisma.roomAttribute.findMany({
    where: { roomId: { in: rooms.map((r) => r.id) } },
    include: { attribute: { select: { name: true } } },
  });
  const attributesByRoomId = new Map<string, string[]>();
  for (const row of roomAttributeRows) {
    const list = attributesByRoomId.get(row.roomId) ?? [];
    list.push(row.attribute.name);
    attributesByRoomId.set(row.roomId, list);
  }

  return {
    rooms: rooms.map((room) => ({
      id: room.id,
      name: room.name,
      location: room.location,
      capacity: room.capacity,
      attributes: attributesByRoomId.get(room.id) ?? [],
    })),
    total,
  };
}
