// src/types/booking.ts
export type BookingStatus = 'CONFIRMED' | 'CANCELLED'; // mirrors Prisma's BookingStatus enum
export type RecurrencePattern = 'DAILY' | 'WEEKLY' | 'MONTHLY'; // mirrors Prisma's RecurrencePattern enum

// startTime/endTime/createdAt/updatedAt are ISO strings over the wire -
// Date objects only exist server-side, before JSON serialization.
//
// createdAt/updatedAt are optional here because not every endpoint returns
// them: createBooking and each occurrence in createSeries's response are
// hand-built literals without those fields, while shortenBooking and
// listMyBookings return the full Prisma row (createdAt/updatedAt included).
export interface Booking {
  id: string;
  roomId: string;
  userId: string;
  seriesId: string | null;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  createdAt?: string;
  updatedAt?: string;
  room?: { name: string; floor: number }; // present only on listMyBookings's results
}

export interface BookingSeries {
  id: string;
  userId: string;
  roomId: string;
  pattern: RecurrencePattern;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  startTimeOfDay: string;
  endTimeOfDay: string;
  occurrenceCount: number;
  createdAt: string;
}

// Request payload shapes, hand-mirrored from api/src/modules/bookings/bookings.schemas.ts - keep in sync.
export interface CreateBookingInput {
  roomId: string;
  startTime: string;
  endTime: string;
}

export interface ShortenBookingInput {
  endTime: string;
}

export interface CreateSeriesInput {
  roomId: string;
  startTime: string;
  endTime: string;
  pattern: RecurrencePattern;
  occurrenceCount: number;
}

export interface CreateSeriesResult {
  series: BookingSeries;
  occurrences: Booking[];
}

export interface ListMyBookingsResult {
  bookings: Booking[];
  total: number;
}
