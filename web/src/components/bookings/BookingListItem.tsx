// src/components/bookings/BookingListItem.tsx
import { useState } from 'react';
import { formatDateTime, toIsoDateTime, fromIsoDateTime } from '../../lib/dateRange';
import { formatFloorLabel } from '../../lib/floor';
import { DatePicker } from '../DatePicker';
import type { Booking } from '../../types/booking';

export interface BookingListItemProps {
  booking: Booking;
  isSeriesMember: boolean;
  onCancel?: (bookingId: string) => void;
  onShorten?: (bookingId: string, newEndTime: string) => void;
  onCancelOccurrence?: (bookingId: string) => void;
}

const MIN_BOOKING_DURATION_MS = 10 * 60 * 1000;

export function BookingListItem({ booking, isSeriesMember, onCancel, onShorten, onCancelOccurrence }: BookingListItemProps) {
  const [shortening, setShortening] = useState(false);
  const [newEndDate, setNewEndDate] = useState(() => fromIsoDateTime(booking.endTime).date);
  const [newEndTime, setNewEndTime] = useState(() => fromIsoDateTime(booking.endTime).time);
  const [shortenError, setShortenError] = useState<string | null>(null);

  const now = new Date();
  const alreadyStarted = new Date(booking.startTime) <= now;
  const alreadyFinished = new Date(booking.endTime) <= now;
  const isCancelled = booking.status === 'CANCELLED';
  const currentEnd = fromIsoDateTime(booking.endTime);
  // A started booking can still be shortened, just not once there's no
  // meaningful time left to trim it to - mirrors the backend's
  // assertShortenableNow (bookings.service.ts) so the button disappears at
  // the same cutoff the API would otherwise reject at anyway.
  const tooCloseToEnd = new Date(booking.endTime).getTime() - now.getTime() < MIN_BOOKING_DURATION_MS;
  const canShorten = !alreadyFinished && !tooCloseToEnd;

  function submitShorten() {
    const iso = toIsoDateTime(newEndDate, newEndTime);
    // WHY these checks happen here too, not only on the backend: the
    // backend is the REAL enforcement (see api's shortenBooking, which
    // rejects a new endTime that isn't strictly earlier than the current
    // one, shorter than 10 minutes, or already in the past) - but without
    // a client-side check, a user would submit, wait for a round trip, and
    // only then see a rejection. Catching it here gives immediate
    // feedback; the backend check is what actually matters for correctness.
    if (!iso || new Date(iso) >= new Date(booking.endTime)) {
      setShortenError('The new end time must be earlier than the current end time.');
      return;
    }
    if (new Date(iso) <= now) {
      setShortenError('The new end time must be in the future.');
      return;
    }
    if (new Date(iso).getTime() - new Date(booking.startTime).getTime() < MIN_BOOKING_DURATION_MS) {
      setShortenError('A booking must be at least 10 minutes long.');
      return;
    }
    setShortenError(null);
    onShorten?.(booking.id, iso);
    setShortening(false);
  }

  return (
    <li className={`booking-item ${isCancelled ? 'booking-item-cancelled' : ''}`}>
      <div className="booking-item-details">
        {booking.room && (
          <span className="booking-item-room">
            {booking.room.name} — {formatFloorLabel(booking.room.floor)}
          </span>
        )}
        <strong>{formatDateTime(booking.startTime)}</strong> – {formatDateTime(booking.endTime)}
        {isCancelled && <span className="badge badge-cancelled">Cancelled</span>}
        {isSeriesMember && <span className="badge badge-series">Series</span>}
      </div>

      {!isCancelled && !alreadyFinished && (
        <div className="booking-item-actions">
          {/* Shorten stays available on an already-started booking, right up
              until fewer than 10 minutes remain before its current end
              (canShorten) - unlike cancel, trimming a running booking still
              leaves an accurate record of what happened, so it isn't blocked
              the instant the booking starts. */}
          {canShorten &&
            (shortening ? (
              <span className="shorten-form">
                {/* `max` disables any date past the current end date in the
                    calendar itself - submitShorten()'s own check above, and
                    the backend's, are still what actually enforce it. */}
                <DatePicker value={newEndDate} onChange={setNewEndDate} max={currentEnd.date} disablePast />
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
            ))}

          {/* Cancel (whole booking or a single series occurrence) is still
              blocked the instant a booking starts - see
              assertNotAlreadyStarted in bookings.service.ts. A distinct
              action for series members - cancelling ONE occurrence should
              never be confused with cancelling the whole booking, so this is
              a visually/behaviorally separate button, not an overload of the
              same one. */}
          {!alreadyStarted &&
            (isSeriesMember ? (
              <button type="button" onClick={() => onCancelOccurrence?.(booking.id)}>
                Cancel this occurrence
              </button>
            ) : (
              <button type="button" onClick={() => onCancel?.(booking.id)}>
                Cancel booking
              </button>
            ))}

          {alreadyStarted && canShorten && <span className="booking-item-note">Already started</span>}
          {alreadyStarted && !canShorten && (
            <span className="booking-item-note">Less than 10 minutes remain - can no longer be changed</span>
          )}
        </div>
      )}

      {!isCancelled && alreadyFinished && <span className="booking-item-note">Finished</span>}
    </li>
  );
}
