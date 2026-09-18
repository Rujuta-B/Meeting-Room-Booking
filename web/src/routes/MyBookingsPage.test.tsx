// src/routes/MyBookingsPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MyBookingsPage } from './MyBookingsPage';
import * as bookingsApi from '../api/bookings';
import { ApiError } from '../lib/ApiError';
import type { Booking } from '../types/booking';

vi.mock('../api/bookings');

// Both bookings are far enough in the future that BookingListItem renders
// its action buttons (Shorten / Cancel) instead of the "Already started"/
// "Finished" note.
const standaloneBooking: Booking = {
  id: 'booking-standalone',
  roomId: 'room-1',
  userId: 'user-1',
  seriesId: null,
  startTime: '2099-05-01T10:00:00.000Z',
  endTime: '2099-05-01T11:00:00.000Z',
  status: 'CONFIRMED',
  room: { name: 'Cedar', floor: 2 },
};

const seriesOccurrence1: Booking = {
  id: 'booking-series-1',
  roomId: 'room-2',
  userId: 'user-1',
  seriesId: 'series-1',
  startTime: '2099-05-08T10:00:00.000Z',
  endTime: '2099-05-08T11:00:00.000Z',
  status: 'CONFIRMED',
  room: { name: 'Willow', floor: 3 },
};

const seriesOccurrence2: Booking = {
  id: 'booking-series-2',
  roomId: 'room-2',
  userId: 'user-1',
  seriesId: 'series-1',
  startTime: '2099-05-15T10:00:00.000Z',
  endTime: '2099-05-15T11:00:00.000Z',
  status: 'CONFIRMED',
  room: { name: 'Willow', floor: 3 },
};

function mockList(bookings: Booking[]) {
  vi.mocked(bookingsApi.listMyBookings).mockResolvedValue({
    bookings,
    pagination: { page: 1, pageSize: 20, total: bookings.length, totalPages: 1 },
  });
}

describe('MyBookingsPage', () => {
  beforeEach(() => {
    vi.mocked(bookingsApi.listMyBookings).mockReset();
    vi.mocked(bookingsApi.cancelBooking).mockReset();
    vi.mocked(bookingsApi.shortenBooking).mockReset();
    vi.mocked(bookingsApi.cancelSeriesOccurrence).mockReset();
  });

  it('groups bookings into a "One-off bookings" section and a "Recurring series" section by seriesId', async () => {
    mockList([standaloneBooking, seriesOccurrence1, seriesOccurrence2]);

    render(<MyBookingsPage />);

    expect(await screen.findByText('One-off bookings')).toBeInTheDocument();
    const oneOffSection = screen.getByText('One-off bookings').closest('section') as HTMLElement;
    expect(within(oneOffSection).getByText('Cedar — 2nd floor')).toBeInTheDocument();

    expect(screen.getByText('Recurring series')).toBeInTheDocument();
    const seriesSection = screen.getByText('Recurring series').closest('section') as HTMLElement;
    expect(within(seriesSection).getAllByText('Willow — 3rd floor')).toHaveLength(2);
    expect(within(seriesSection).getAllByText('Series')).toHaveLength(2);
  });

  it('shows the empty state when there are no bookings', async () => {
    mockList([]);

    render(<MyBookingsPage />);

    expect(await screen.findByText('You have no bookings yet.')).toBeInTheDocument();
  });

  it('cancels a standalone booking and reloads the list', async () => {
    mockList([standaloneBooking]);
    vi.mocked(bookingsApi.cancelBooking).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(<MyBookingsPage />);
    await screen.findByText('Cedar — 2nd floor');

    await user.click(screen.getByRole('button', { name: 'Cancel booking' }));

    expect(bookingsApi.cancelBooking).toHaveBeenCalledWith('booking-standalone');
    expect(bookingsApi.listMyBookings).toHaveBeenCalledTimes(2);
  });

  it('shortens a booking and reloads the list', async () => {
    mockList([standaloneBooking]);
    vi.mocked(bookingsApi.shortenBooking).mockResolvedValueOnce(standaloneBooking);
    const user = userEvent.setup();

    render(<MyBookingsPage />);
    await screen.findByText('Cedar — 2nd floor');

    await user.click(screen.getByRole('button', { name: 'Shorten' }));

    // Booking times are edited in IST (see dateRange.ts's fromIsoDateTime/
    // toIsoDateTime) - the stored 10:00-11:00 UTC is displayed/edited as
    // 15:30-16:30 IST. submitShorten() only calls onShorten when the new
    // end time is strictly earlier than the current end AND at least 10
    // minutes after the booking's own start, so the test moves it back to
    // 16:00 IST, not all the way to/before the 15:30 IST start.
    const timeInputs = document.querySelectorAll('input[type="time"]');
    const timeInput = timeInputs[0] as HTMLInputElement;
    await user.clear(timeInput);
    await user.type(timeInput, '16:00');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(bookingsApi.shortenBooking).toHaveBeenCalledWith(
      'booking-standalone',
      expect.any(String),
    );
    expect(bookingsApi.listMyBookings).toHaveBeenCalledTimes(2);
  });

  it('cancels a single series occurrence and reloads the list', async () => {
    mockList([seriesOccurrence1, seriesOccurrence2]);
    vi.mocked(bookingsApi.cancelSeriesOccurrence).mockResolvedValueOnce(undefined);
    const user = userEvent.setup();

    render(<MyBookingsPage />);
    await screen.findByText('Recurring series');

    const buttons = screen.getAllByRole('button', { name: 'Cancel this occurrence' });
    await user.click(buttons[0] as HTMLElement);

    expect(bookingsApi.cancelSeriesOccurrence).toHaveBeenCalledWith('booking-series-1');
    expect(bookingsApi.listMyBookings).toHaveBeenCalledTimes(2);
  });

  it('shows a specific message when cancelling an already-started booking fails', async () => {
    mockList([standaloneBooking]);
    vi.mocked(bookingsApi.cancelBooking).mockRejectedValueOnce(
      new ApiError('BOOKING_ALREADY_STARTED', 409),
    );
    const user = userEvent.setup();

    render(<MyBookingsPage />);
    await screen.findByText('Cedar — 2nd floor');

    await user.click(screen.getByRole('button', { name: 'Cancel booking' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That booking has already started and can no longer be cancelled.',
    );
  });
});
