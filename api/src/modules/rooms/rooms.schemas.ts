// src/modules/rooms/rooms.schemas.ts
import { z } from 'zod';

// Shared by every paginated list endpoint (rooms list, rooms search,
// utilisation report). pageSize is capped at 100 - without a cap, a
// client could request pageSize=1000000 and defeat the entire point of
// paginating, forcing the DB (and the response body) back to "return
// everything."
export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type PaginationInput = z.infer<typeof PaginationSchema>;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function buildPaginationMeta(input: PaginationInput, total: number): PaginationMeta {
  return {
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
  };
}

export const CreateRoomSchema = z.object({
  name: z.string().min(1, 'Name is required.'),
  // A bounded integer, not free text - see schema.prisma's comment on
  // Room.floor for why "floor" is validated as a plain number rather than
  // a string that could be "Floor 2", "2nd floor", or "2" depending on who
  // typed it.
  floor: z.number().int().min(1, 'Floor must be at least 1.').max(50, 'Floor cannot exceed 50.'),
  // Floored at 2 (a "room" for exactly one person isn't a meeting room)
  // and capped at 500: generous enough for any real conference
  // room/auditorium while rejecting obvious garbage input (e.g. an
  // 18-digit number typed into the field by mistake).
  capacity: z.number().int().min(2, 'Capacity must be at least 2.').max(500, 'Capacity cannot exceed 500.'),
  // Attribute NAMES, not ids - keeps the admin room-creation payload
  // human-readable; the service resolves names to Attribute rows,
  // creating any that don't exist yet.
  attributes: z.array(z.string().min(1)).default([]),
});
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;

export const UpdateRoomSchema = CreateRoomSchema.partial();
export type UpdateRoomInput = z.infer<typeof UpdateRoomSchema>;

// WHY this validates ISO datetime STRINGS with z.coerce.date(), and WHY
// endTime > startTime is checked HERE (via .refine) rather than left to
// the database: the spec explicitly requires "a booking with the end time
// before the start" to be rejected BEFORE it reaches business logic. Doing
// this check in the schema means a malformed range never even reaches
// rooms.service.ts - it's rejected at the very first boundary, with a
// specific, field-attributed error message.
export const SearchAvailabilitySchema = z
  .object({
    startTime: z.coerce.date({ errorMap: () => ({ message: 'startTime must be a valid ISO date-time.' }) }),
    endTime: z.coerce.date({ errorMap: () => ({ message: 'endTime must be a valid ISO date-time.' }) }),
    // Floored at 2, matching CreateRoomSchema's room-capacity floor - no
    // room can ever have capacity 1, so a lower minCapacity would be
    // meaningless.
    minCapacity: z.coerce.number().int().min(2).default(2),
    // Free-text substring match against name only, e.g. "Aspen" - resolved
    // as a case-insensitive ILIKE in the service, not fetched-then-filtered
    // in JS. Floor is deliberately NOT part of this search: it's a plain
    // int (see schema.prisma's Room.floor comment), which ILIKE can't
    // usefully match, and "2" would ambiguously match both "floor 2" and a
    // room literally named "2".
    name: z.string().trim().min(1).optional(),
    // Comma-separated attribute names in the query string, e.g.
    // ?attributes=projector,whiteboard - transformed into a clean array.
    attributes: z
      .string()
      .optional()
      .transform((value) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [])),
  })
  .merge(PaginationSchema)
  .refine((data) => data.endTime > data.startTime, {
    message: 'endTime must be after startTime.',
    path: ['endTime'],
  })
  .refine((data) => data.startTime > new Date(), {
    message: 'startTime must be in the future.',
    path: ['startTime'],
  });
export type SearchAvailabilityInput = z.infer<typeof SearchAvailabilitySchema>;

// GET /rooms (the admin/plain room catalogue listing) - previously took no
// params at all and always returned every room.
export const ListRoomsQuerySchema = z.object({
  name: z.string().trim().min(1).optional(),
}).merge(PaginationSchema);
export type ListRoomsQueryInput = z.infer<typeof ListRoomsQuerySchema>;
