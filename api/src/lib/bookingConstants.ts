// src/lib/bookingConstants.ts
//
// Lives outside modules/bookings so both bookings.schemas.ts (booking
// create/shorten/series) and rooms.schemas.ts (availability search) can
// import it without creating a rooms <-> bookings circular import - rooms
// already has no dependency on bookings, and searching for a slot shorter
// than the minimum bookable duration is exactly as meaningless as creating
// one.
export const MIN_BOOKING_DURATION_MS = 10 * 60 * 1000;
