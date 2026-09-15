// src/modules/bookings/bookings.schemas.ts
import { z } from 'zod';

// Reused for both a one-off booking and (indirectly) each occurrence of a
// series. `roomId` is checked for FORMAT here (a valid UUID) - whether it
// actually EXISTS in the database is a business-logic check the schema
// can't make (schemas validate shape, not database state), so that's
// deferred to bookings.service.ts. This is exactly the "bad input
// rejected before it reaches business logic" split the spec asks for:
// malformed input never gets past this schema; a well-formed but
// nonexistent room id is still caught, just one layer deeper.
export const CreateBookingSchema = z
  .object({
    roomId: z.string().uuid('roomId must be a valid room id.'),
    startTime: z.coerce.date({ errorMap: () => ({ message: 'startTime must be a valid ISO date-time.' }) }),
    endTime: z.coerce.date({ errorMap: () => ({ message: 'endTime must be a valid ISO date-time.' }) }),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'endTime must be after startTime.',
    path: ['endTime'],
  })
  .refine((data) => data.startTime > new Date(), {
    message: 'startTime must be in the future.',
    path: ['startTime'],
  });
export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;

export const ShortenBookingSchema = z.object({
  endTime: z.coerce.date({ errorMap: () => ({ message: 'endTime must be a valid ISO date-time.' }) }),
});
export type ShortenBookingInput = z.infer<typeof ShortenBookingSchema>;

// A recurring series: room + a starting occurrence's time range + how many
// WEEKLY occurrences to generate. The service derives each occurrence's
// own start/end by adding N weeks to the first one - see bookings.service.ts.
export const CreateSeriesSchema = z
  .object({
    roomId: z.string().uuid('roomId must be a valid room id.'),
    startTime: z.coerce.date({ errorMap: () => ({ message: 'startTime must be a valid ISO date-time.' }) }),
    endTime: z.coerce.date({ errorMap: () => ({ message: 'endTime must be a valid ISO date-time.' }) }),
    occurrenceCount: z.number().int().min(1).max(52, 'A series can have at most 52 occurrences.'),
  })
  .refine((data) => data.endTime > data.startTime, {
    message: 'endTime must be after startTime.',
    path: ['endTime'],
  })
  .refine((data) => data.startTime > new Date(), {
    message: 'startTime must be in the future.',
    path: ['startTime'],
  });
export type CreateSeriesInput = z.infer<typeof CreateSeriesSchema>;
