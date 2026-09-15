// src/components/bookings/BookingListItem.jsx
import { useState } from 'react';
import { formatDateTime, toIsoDateTime, fromIsoDateTime } from '../../lib/dateRange.js';

/**
 * @param {{
 *   booking: { id: string, startTime: string, endTime: string, status: string, room?: { name: string, location: string } },
 *   isSeriesMember: boolean,
 *   onCancel?: (bookingId: string) => void,
 *   onShorten?: (bookingId: string, newEndTime: string) => void,
 *   onCancelOccurrence?: (bookingId: string) => void,
 * }} props
 */
export function BookingListItem({ booking, isSeriesMember, onCancel, onShorten, onCancelOccurrence }) {
  const [shortening, setShortening] = useState(false);
  const [newEndDate, setNewEndDate] = useState(() => fromIsoDateTime(booking.endTime).date);
  const [newEndTime, setNewEndTime] = useState(() => fromIsoDateTime(booking.endTime).time);
  const [shortenError, setShortenError] = useState(null);

  const alreadyStarted = new Date(booking.startTime) <= new Date();
  const isCancelled = booking.status === 'CANCELLED';
  const currentEnd = fromIsoDateTime(booking.endTime);

  function submitShorten() {
    const iso = toIsoDateTime(newEndDate, newEndTime);
    // WHY this check happens here too, not only on the backend: the
    // backend is the REAL enforcement (see api's shortenBooking, which
    // rejects a new endTime that isn't strictly earlier than the current
    // one) - but without a client-side check, a user who picks a later
    // time would submit, wait for a round trip, and only then see a
    // rejection. Catching it here gives immediate feedback; the backend
    // check is what actually matters for correctness.
    if (new Date(iso) >= new Date(booking.endTime)) {
      setShortenError('The new end time must be earlier than the current end time.');
      return;
    }
    setShortenError(null);
    onShorten(booking.id, iso);
    setShortening(false);
  }

  return (
    <li className={`booking-item ${isCancelled ? 'booking-item-cancelled' : ''}`}>
      <div className="booking-item-details">
        {booking.room && (
          <span className="booking-item-room">
            {booking.room.name} — {booking.room.location}
          </span>
        )}
        <strong>{formatDateTime(booking.startTime)}</strong> – {formatDateTime(booking.endTime)}
        {isCancelled && <span className="badge badge-cancelled">Cancelled</span>}
        {isSeriesMember && <span className="badge badge-series">Series</span>}
      </div>

      {!isCancelled && !alreadyStarted && (
        <div className="booking-item-actions">
          {shortening ? (
            <span className="shorten-form">
              {/* `max` is a UX hint (browsers vary in how strictly they
                  enforce it), not the real guard - submitShorten()'s own
                  check above, and the backend's, are what actually matter. */}
              <input
                type="date"
                value={newEndDate}
                max={currentEnd.date}
                onChange={(e) => setNewEndDate(e.target.value)}
              />
              <input type="time" value={newEndTime} onChange={(e) => setNewEndTime(e.target.value)} />
              <button type="button" onClick={submitShorten}>
                Save
              </button>
              <button type="button" onClick={() => setShortening(false)}>
                Cancel edit
              </button>
              {shortenError && <span className="field-error">{shortenError}</span>}
            </span>
          ) : (
            <button type="button" onClick={() => setShortening(true)}>
              Shorten
            </button>
          )}

          {/* A distinct action for series members - cancelling ONE
              occurrence should never be confused with cancelling the whole
              booking, so this is a visually/behaviorally separate button,
              not an overload of the same one. */}
          {isSeriesMember ? (
            <button type="button" onClick={() => onCancelOccurrence(booking.id)}>
              Cancel this occurrence
            </button>
          ) : (
            <button type="button" onClick={() => onCancel(booking.id)}>
              Cancel booking
            </button>
          )}
        </div>
      )}

      {!isCancelled && alreadyStarted && <span className="booking-item-note">Already started</span>}
    </li>
  );
}
