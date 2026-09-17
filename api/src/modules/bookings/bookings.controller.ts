// src/modules/bookings/bookings.controller.ts
import type { Request, Response } from 'express';
import * as bookingsService from './bookings.service.js';
import { buildPaginationMeta } from '../rooms/rooms.schemas.js';
import type { CreateBookingInput, ShortenBookingInput, CreateSeriesInput, ListMyBookingsQueryInput } from './bookings.schemas.js';

export async function createBookingHandler(req: Request<unknown, unknown, CreateBookingInput>, res: Response): Promise<void> {
  // req.user is guaranteed to exist here because `authenticate` runs
  // before this handler on every bookings route - see bookings.routes.ts.
  const booking = await bookingsService.createBooking(req.user!.id, req.body);
  req.log.info({ bookingId: booking.id, roomId: booking.roomId, userId: booking.userId }, 'Booking created');
  res.status(201).json({ booking });
}

// WHY req.query is read as `unknown` and cast: same reasoning as
// rooms.controller.ts's listRoomsHandler - validate() already replaced
// req.query with the parsed, coerced ListMyBookingsQueryInput before this
// handler runs.
export async function listMyBookingsHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as ListMyBookingsQueryInput;
  const { bookings, total } = await bookingsService.listMyBookings(req.user!.id, query);
  res.json({ bookings, pagination: buildPaginationMeta(query, total) });
}

export async function cancelBookingHandler(req: Request<{ id: string }>, res: Response): Promise<void> {
  await bookingsService.cancelBooking(req.params.id, req.user!.id);
  req.log.info({ bookingId: req.params.id, userId: req.user!.id }, 'Booking cancelled');
  res.status(204).send();
}

export async function shortenBookingHandler(req: Request<{ id: string }, unknown, ShortenBookingInput>, res: Response): Promise<void> {
  const booking = await bookingsService.shortenBooking(req.params.id, req.user!.id, req.body);
  req.log.info({ bookingId: booking.id, userId: req.user!.id, newEndTime: booking.endTime }, 'Booking shortened');
  res.json({ booking });
}

export async function createSeriesHandler(req: Request<unknown, unknown, CreateSeriesInput>, res: Response): Promise<void> {
  const result = await bookingsService.createSeries(req.user!.id, req.body);
  req.log.info(
    { seriesId: result.series.id, occurrenceCount: result.occurrences.length, userId: req.user!.id },
    'Recurring booking series created',
  );
  res.status(201).json(result);
}

export async function cancelOccurrenceHandler(req: Request<{ id: string }>, res: Response): Promise<void> {
  await bookingsService.cancelSeriesOccurrence(req.params.id, req.user!.id);
  req.log.info({ bookingId: req.params.id, userId: req.user!.id }, 'Series occurrence cancelled');
  res.status(204).send();
}
