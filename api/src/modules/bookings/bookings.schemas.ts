// src/modules/bookings/bookings.schemas.ts
import { z } from 'zod';
import { PaginationSchema } from '../rooms/rooms.schemas.js';

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

// A recurring series: room + a starting occurrence's time range + a fixed
// cadence (see schema.prisma's RecurrencePattern) + how many occurrences to
// generate. A discriminated union on `pattern` (rather than one shape with
// an arbitrary "every N days" interval) is deliberate: it closes off the
// input to cadences a person actually thinks in, and lets each pattern
// carry its own sane occurrence-count cap - DAILY can run for about a
// month, WEEKLY/MONTHLY for about a year, rather than one number (52) that
// made sense for weekly but let daily/monthly requests balloon unbounded.
//
// WEEKLY's weekday and MONTHLY's day-of-month are deliberately NOT separate
// input fields - both are derived from `startTime` itself (see
// bookings.service.ts#computeOccurrenceStart), so there's no way for a
// caller to submit a day-of-month that disagrees with the date they also
// picked.
const SeriesBaseFields = {
  roomId: z.string().uuid('roomId must be a valid room id.'),
  startTime: z.coerce.date({ errorMap: () => ({ message: 'startTime must be a valid ISO date-time.' }) }),
  endTime: z.coerce.date({ errorMap: () => ({ message: 'endTime must be a valid ISO date-time.' }) }),
};

const DailySeriesSchema = z.object({
  ...SeriesBaseFields,
  pattern: z.literal('DAILY'),
  occurrenceCount: z.number().int().min(1).max(30, 'A daily series can have at most 30 occurrences.'),
});

const WeeklySeriesSchema = z.object({
  ...SeriesBaseFields,
  pattern: z.literal('WEEKLY'),
  occurrenceCount: z.number().int().min(1).max(12, 'A weekly series can have at most 12 occurrences.'),
});

const MonthlySeriesSchema = z.object({
  ...SeriesBaseFields,
  pattern: z.literal('MONTHLY'),
  occurrenceCount: z.number().int().min(1).max(12, 'A monthly series can have at most 12 occurrences.'),
});

export const CreateSeriesSchema = z
  .discriminatedUnion('pattern', [DailySeriesSchema, WeeklySeriesSchema, MonthlySeriesSchema])
  .refine((data) => data.endTime > data.startTime, {
    message: 'endTime must be after startTime.',
    path: ['endTime'],
  })
  .refine((data) => data.startTime > new Date(), {
    message: 'startTime must be in the future.',
    path: ['startTime'],
  });
export type CreateSeriesInput = z.infer<typeof CreateSeriesSchema>;

// GET /bookings/me - reuses the shared PaginationSchema but overrides its
// default pageSize (20, tuned for the admin rooms table) down to 10, which
// is what a single user's own booking list actually calls for.
export const ListMyBookingsQuerySchema = PaginationSchema.extend({
  pageSize: PaginationSchema.shape.pageSize.default(10),
});
export type ListMyBookingsQueryInput = z.infer<typeof ListMyBookingsQuerySchema>;
