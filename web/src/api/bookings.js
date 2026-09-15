// src/api/bookings.js
import { apiFetch } from './client.js';

export async function createBooking(roomId, startTime, endTime) {
  const { booking } = await apiFetch('/bookings', {
    method: 'POST',
    body: JSON.stringify({ roomId, startTime, endTime }),
  });
  return booking;
}

export async function listMyBookings() {
  const { bookings } = await apiFetch('/bookings/me');
  return bookings;
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

export async function createSeries(roomId, startTime, endTime, occurrenceCount) {
  return apiFetch('/bookings/series', {
    method: 'POST',
    body: JSON.stringify({ roomId, startTime, endTime, occurrenceCount }),
  });
}

// A distinct endpoint from cancelBooking - see api/src/modules/bookings/bookings.routes.ts -
// so the intent "just this occurrence" is explicit end to end, matching
// the UI's own distinct "cancel this occurrence" vs "cancel booking" actions.
export async function cancelSeriesOccurrence(bookingId) {
  await apiFetch(`/bookings/${bookingId}/occurrence`, { method: 'DELETE' });
}
