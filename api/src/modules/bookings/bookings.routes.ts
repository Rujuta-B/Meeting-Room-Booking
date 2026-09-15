// src/modules/bookings/bookings.routes.ts
//
// EVERY route here requires `authenticate` - there is no anonymous
// booking or cancellation path anywhere in this module, per the spec.
// Ownership (can THIS user act on THIS specific booking) is checked one
// layer deeper, inside bookings.service.ts, since it depends on the
// specific booking row (which route params alone can't express as
// middleware without an extra DB round-trip per route definition).
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { CreateBookingSchema, ShortenBookingSchema, CreateSeriesSchema } from './bookings.schemas.js';
import {
  createBookingHandler,
  listMyBookingsHandler,
  cancelBookingHandler,
  shortenBookingHandler,
  createSeriesHandler,
  cancelOccurrenceHandler,
} from './bookings.controller.js';

export const bookingRoutes = Router();

bookingRoutes.post('/', authenticate, validate(CreateBookingSchema), asyncHandler(createBookingHandler));
bookingRoutes.get('/me', authenticate, asyncHandler(listMyBookingsHandler));
bookingRoutes.delete('/:id', authenticate, asyncHandler(cancelBookingHandler));
bookingRoutes.patch('/:id/shorten', authenticate, validate(ShortenBookingSchema), asyncHandler(shortenBookingHandler));

bookingRoutes.post('/series', authenticate, validate(CreateSeriesSchema), asyncHandler(createSeriesHandler));
// A distinct route (not reusing DELETE /bookings/:id) so the intent "this
// occurrence only" is explicit in the URL itself, matching the frontend's
// distinct "cancel occurrence" action (see the plan §7d) rather than
// overloading one endpoint with an ambiguous query param.
bookingRoutes.delete('/:id/occurrence', authenticate, asyncHandler(cancelOccurrenceHandler));
