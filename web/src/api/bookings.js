// src/api/bookings.js
import { apiFetch } from './client.js';

export async function createBooking(roomId, startTime, endTime) {
  const { booking } = await apiFetch('/bookings', {
    method: 'POST',
    body: JSON.stringify({ roomId, startTime, endTime }),
  });
  return booking;
}

/**
 * @param {{ page?: number, pageSize?: number }} [options]
 * @returns {Promise<{ bookings: object[], pagination: { page: number, pageSize: number, total: number, totalPages: number } }>}
 */
export async function listMyBookings({ page, pageSize } = {}) {
  const params = new URLSearchParams({
    ...(page ? { page: String(page) } : {}),
    ...(pageSize ? { pageSize: String(pageSize) } : {}),
  });
  const query = params.toString();
  return apiFetch(`/bookings/me${query ? `?${query}` : ''}`);
}

export async function cancelBooking(bookingId) {
  await apiFetch(`/bookings/${bookingId}`, { method: 'DELETE' });
}

export async function shortenBooking(bookingId, endTime) {
  const { booking } = await apiFetch(`/bookings/${bookingId}/shorten`, {
    method: 'PATCH',
    body: JSON.stringify({ endTime }),
  });
  return booking;
}

export async function createSeries(roomId, startTime, endTime, occurrenceCount, pattern) {
  return apiFetch('/bookings/series', {
    method: 'POST',
    body: JSON.stringify({ roomId, startTime, endTime, occurrenceCount, pattern }),
  });
}

// A distinct endpoint from cancelBooking - see api/src/modules/bookings/bookings.routes.ts -
// so the intent "just this occurrence" is explicit end to end, matching
// the UI's own distinct "cancel this occurrence" vs "cancel booking" actions.
export async function cancelSeriesOccurrence(bookingId) {
  await apiFetch(`/bookings/${bookingId}/occurrence`, { method: 'DELETE' });
}
