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
  location: z.string().min(1, 'Location is required.'),
  capacity: z.number().int().positive('Capacity must be a positive integer.'),
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
    minCapacity: z.coerce.number().int().positive().default(1),
    // Free-text substring match against name OR location, e.g. "3rd floor"
    // or "Aspen" - resolved as a case-insensitive ILIKE in the service, not
    // fetched-then-filtered in JS.
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
