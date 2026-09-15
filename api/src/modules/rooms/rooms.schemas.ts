// src/modules/rooms/rooms.schemas.ts
import { z } from 'zod';

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
    // Comma-separated attribute names in the query string, e.g.
    // ?attributes=projector,whiteboard - transformed into a clean array.
    attributes: z
      .string()
      .optional()
      .transform((value) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [])),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'endTime must be after startTime.',
    path: ['endTime'],
  })
  .refine((data) => data.startTime > new Date(), {
    message: 'startTime must be in the future.',
    path: ['startTime'],
  });
export type SearchAvailabilityInput = z.infer<typeof SearchAvailabilitySchema>;
