// src/api/bookings.ts
import { apiFetch } from './client';
import type { PaginationMeta } from '../types/api';
import type { Booking, RecurrencePattern, CreateSeriesResult } from '../types/booking';

export async function createBooking(roomId: string, startTime: string, endTime: string): Promise<Booking> {
  const { booking } = await apiFetch<{ booking: Booking }>('/bookings', {
    method: 'POST',
    body: JSON.stringify({ roomId, startTime, endTime }),
  });
  return booking;
}

export interface ListMyBookingsOptions {
  page?: number;
  pageSize?: number;
}

export async function listMyBookings(
  { page, pageSize }: ListMyBookingsOptions = {},
): Promise<{ bookings: Booking[]; pagination: PaginationMeta }> {
  const params = new URLSearchParams({
    ...(page ? { page: String(page) } : {}),
    ...(pageSize ? { pageSize: String(pageSize) } : {}),
  });
  const query = params.toString();
  return apiFetch(`/bookings/me${query ? `?${query}` : ''}`);
}

export async function cancelBooking(bookingId: string): Promise<void> {
  await apiFetch(`/bookings/${bookingId}`, { method: 'DELETE' });
}

export async function shortenBooking(bookingId: string, endTime: string): Promise<Booking> {
  const { booking } = await apiFetch<{ booking: Booking }>(`/bookings/${bookingId}/shorten`, {
    method: 'PATCH',
    body: JSON.stringify({ endTime }),
  });
  return booking;
}

export async function createSeries(
  roomId: string,
  startTime: string,
  endTime: string,
  occurrenceCount: number,
  pattern: RecurrencePattern,
): Promise<CreateSeriesResult> {
  return apiFetch('/bookings/series', {
    method: 'POST',
    body: JSON.stringify({ roomId, startTime, endTime, occurrenceCount, pattern }),
  });
}

// A distinct endpoint from cancelBooking - see api/src/modules/bookings/bookings.routes.ts -
// so the intent "just this occurrence" is explicit end to end, matching
// the UI's own distinct "cancel this occurrence" vs "cancel booking" actions.
export async function cancelSeriesOccurrence(bookingId: string): Promise<void> {
  await apiFetch(`/bookings/${bookingId}/occurrence`, { method: 'DELETE' });
}
