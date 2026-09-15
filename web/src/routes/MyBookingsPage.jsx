// src/routes/MyBookingsPage.jsx
import { useEffect, useState, useCallback } from 'react';
import { listMyBookings, cancelBooking, shortenBooking, cancelSeriesOccurrence } from '../api/bookings.js';
import { BookingListItem } from '../components/bookings/BookingListItem.jsx';
import { ErrorBanner } from '../components/ErrorBanner.jsx';
import { ApiError } from '../lib/ApiError.js';

export function MyBookingsPage() {
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      const result = await listMyBookings();
      setBookings(result);
    } catch {
      setError('Could not load your bookings.');
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleCancel(bookingId) {
    setError(null);
    try {
      await cancelBooking(bookingId);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'BOOKING_ALREADY_STARTED'
        ? 'That booking has already started and can no longer be cancelled.'
        : 'Could not cancel that booking.');
    }
  }

  async function handleCancelOccurrence(bookingId) {
    setError(null);
    try {
      await cancelSeriesOccurrence(bookingId);
      await reload();
    } catch {
      setError('Could not cancel that occurrence.');
    }
  }

  async function handleShorten(bookingId, newEndTime) {
    setError(null);
    try {
      await shortenBooking(bookingId, newEndTime);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'BOOKING_ALREADY_STARTED'
        ? 'That booking has already started and can no longer be shortened.'
        : 'Could not shorten that booking.');
    }
  }

  if (!bookings) return <p>Loading…</p>;

  // Group by seriesId so a recurring series renders as one expandable
  // block with a badge, rather than N indistinguishable rows - see the
  // plan (§7d) for why this matters: a user should be able to tell at a
  // glance "this is part of a series" before deciding whether to cancel
  // just one occurrence or treat it as standalone.
  const standalone = bookings.filter((b) => !b.seriesId);
  const bySeriesId = bookings.reduce((acc, b) => {
    if (!b.seriesId) return acc;
    (acc[b.seriesId] ??= []).push(b);
    return acc;
  }, {});

  return (
    <div className="my-bookings-page">
      <h1>My bookings</h1>
      {error && <ErrorBanner message={error} />}

      {standalone.length > 0 && (
        <section>
          <h2>One-off bookings</h2>
          <ul className="booking-list">
            {standalone.map((b) => (
              <BookingListItem
                key={b.id}
                booking={b}
                isSeriesMember={false}
                onCancel={handleCancel}
                onShorten={handleShorten}
              />
            ))}
          </ul>
        </section>
      )}

      {Object.entries(bySeriesId).map(([seriesId, occurrences]) => (
        <section key={seriesId}>
          <h2>Recurring series</h2>
          <ul className="booking-list">
            {occurrences
              .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
              .map((b) => (
                <BookingListItem
                  key={b.id}
                  booking={b}
                  isSeriesMember
                  onCancelOccurrence={handleCancelOccurrence}
                />
              ))}
          </ul>
        </section>
      ))}

      {bookings.length === 0 && <p>You have no bookings yet.</p>}
    </div>
  );
}
