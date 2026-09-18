// src/routes/MyBookingsPage.tsx
import { useEffect, useState, useCallback } from 'react';
import { listMyBookings, cancelBooking, shortenBooking, cancelSeriesOccurrence } from '../api/bookings';
import { BookingListItem } from '../components/bookings/BookingListItem';
import { ErrorBanner } from '../components/ErrorBanner';
import { Pagination } from '../components/Pagination';
import { ApiError } from '../lib/ApiError';
import type { Booking } from '../types/booking';
import type { PaginationMeta } from '../types/api';

export function MyBookingsPage() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (page = 1) => {
    try {
      const result = await listMyBookings({ page });
      setBookings(result.bookings);
      setPagination(result.pagination);
    } catch {
      setError('Could not load your bookings.');
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleCancel(bookingId: string) {
    setError(null);
    try {
      await cancelBooking(bookingId);
      await reload(pagination?.page);
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'BOOKING_ALREADY_STARTED'
        ? 'That booking has already started and can no longer be cancelled.'
        : 'Could not cancel that booking.');
    }
  }

  async function handleCancelOccurrence(bookingId: string) {
    setError(null);
    try {
      await cancelSeriesOccurrence(bookingId);
      await reload(pagination?.page);
    } catch {
      setError('Could not cancel that occurrence.');
    }
  }

  async function handleShorten(bookingId: string, newEndTime: string) {
    setError(null);
    try {
      await shortenBooking(bookingId, newEndTime);
      await reload(pagination?.page);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'BOOKING_TOO_CLOSE_TO_END') {
        setError('This booking can no longer be shortened - less than 10 minutes remain before it ends.');
      } else if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
        setError(err.details?.errors?.[0]?.message ?? 'Could not shorten that booking.');
      } else {
        setError('Could not shorten that booking.');
      }
    }
  }

  if (!bookings) return <p>Loading…</p>;

  // Group by seriesId so a recurring series renders as one expandable
  // block with a badge, rather than N indistinguishable rows - see the
  // plan (§7d) for why this matters: a user should be able to tell at a
  // glance "this is part of a series" before deciding whether to cancel
  // just one occurrence or treat it as standalone.
  const standalone = bookings.filter((b) => !b.seriesId);
  const bySeriesId = bookings.reduce<Record<string, Booking[]>>((acc, b) => {
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

      <Pagination pagination={pagination} onPageChange={reload} />
    </div>
  );
}
