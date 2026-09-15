// src/routes/BookingFormPage.jsx
//
// This page is the concrete demonstration that the backend's EXCLUDE
// constraint (the whole point of the POC) is reachable and handled
// gracefully end to end - see BookingConflictBanner.jsx for why a 409 gets
// distinct treatment here instead of falling through to a generic error.
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createBooking } from '../api/bookings.js';
import { searchAvailableRooms } from '../api/rooms.js';
import { formatDateTime } from '../lib/dateRange.js';
import { ApiError } from '../lib/ApiError.js';
import { BookingConflictBanner } from '../components/bookings/BookingConflictBanner.jsx';
import { ErrorBanner } from '../components/ErrorBanner.jsx';

export function BookingFormPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const roomId = searchParams.get('roomId');
  const startTime = searchParams.get('startTime');
  const endTime = searchParams.get('endTime');

  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshedRooms, setRefreshedRooms] = useState(null);

  async function handleConfirm() {
    setError(null);
    setConflict(false);
    setSubmitting(true);
    try {
      await createBooking(roomId, startTime, endTime);
      navigate('/my-bookings');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'BOOKING_CONFLICT') {
        setConflict(true);
        // WHY re-check availability immediately, rather than just showing
        // the banner: the user is otherwise left staring at a "this room
        // is available" screen that is now STALE - the whole point of
        // demonstrating the race condition gracefully is showing them
        // what's ACTUALLY free right now, not just that their attempt
        // failed. This re-uses the same search the room list came from,
        // for the exact window they wanted.
        try {
          const rooms = await searchAvailableRooms({ startTime, endTime, minCapacity: 1 });
          setRefreshedRooms(rooms);
        } catch {
          // If even the re-check fails, that's fine - the conflict banner
          // alone still tells the user what happened.
        }
      } else if (err instanceof ApiError && err.code === 'BOOKING_ALREADY_STARTED') {
        setError('That time has already passed.');
      } else if (
        err instanceof ApiError &&
        err.code === 'VALIDATION_ERROR' &&
        err.details?.errors?.some((e) => e.field === 'startTime')
      ) {
        setError('That time has already passed.');
      } else {
        setError('Could not create the booking. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!roomId || !startTime || !endTime) {
    return <ErrorBanner message="Missing booking details. Please search for a room again." />;
  }

  return (
    <div className="booking-form-page">
      <h1>Confirm booking</h1>
      <p>
        <strong>When:</strong> {formatDateTime(startTime)} – {formatDateTime(endTime)}
      </p>

      {conflict && <BookingConflictBanner onDismiss={() => setConflict(false)} />}
      {error && <ErrorBanner message={error} />}

      {!conflict && (
        <button type="button" onClick={handleConfirm} disabled={submitting}>
          {submitting ? 'Booking…' : 'Confirm booking'}
        </button>
      )}

      {conflict && refreshedRooms && (
        <div className="refreshed-results">
          <h2>Still available for this time</h2>
          {refreshedRooms.length === 0 ? (
            <p>No rooms are free for this exact window anymore. Try searching a different time.</p>
          ) : (
            <ul>
              {refreshedRooms.map((room) => (
                <li key={room.id}>
                  {room.name} ({room.location}) — capacity {room.capacity}
                  {room.id !== roomId && (
                    <button
                      type="button"
                      onClick={() => {
                        const params = new URLSearchParams({ roomId: room.id, startTime, endTime });
                        navigate(`/book?${params.toString()}`);
                      }}
                    >
                      Book this instead
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
