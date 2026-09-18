// src/routes/BookingFormPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BookingFormPage } from './BookingFormPage';
import * as bookingsApi from '../api/bookings';
import * as roomsApi from '../api/rooms';
import { ApiError } from '../lib/ApiError';
import type { Booking } from '../types/booking';

vi.mock('../api/bookings');
vi.mock('../api/rooms');

const roomId = 'room-1';
const startTime = '2026-05-01T10:00:00.000Z';
const endTime = '2026-05-01T11:00:00.000Z';

function renderPage() {
  const params = new URLSearchParams({ roomId, startTime, endTime });
  return render(
    <MemoryRouter initialEntries={[`/book?${params.toString()}`]}>
      <Routes>
        <Route path="/book" element={<BookingFormPage />} />
        <Route path="/my-bookings" element={<div>My bookings page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BookingFormPage', () => {
  beforeEach(() => {
    vi.mocked(bookingsApi.createBooking).mockReset();
    vi.mocked(roomsApi.searchAvailableRooms).mockReset();
  });

  it('creates the booking and navigates to my-bookings on success', async () => {
    vi.mocked(bookingsApi.createBooking).mockResolvedValueOnce({
      id: 'booking-1',
      roomId,
      userId: 'user-1',
      seriesId: null,
      startTime,
      endTime,
      status: 'CONFIRMED',
    } satisfies Booking);
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    expect(bookingsApi.createBooking).toHaveBeenCalledWith(roomId, startTime, endTime);
    expect(await screen.findByText('My bookings page')).toBeInTheDocument();
  });

  it('shows the conflict banner and re-searches for available rooms on BOOKING_CONFLICT', async () => {
    vi.mocked(bookingsApi.createBooking).mockRejectedValueOnce(new ApiError('BOOKING_CONFLICT', 409));
    vi.mocked(roomsApi.searchAvailableRooms).mockResolvedValueOnce({
      rooms: [{ id: 'room-2', name: 'Cedar', floor: 2, capacity: 4, attributes: [] }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This slot was just booked by someone else.',
    );
    expect(roomsApi.searchAvailableRooms).toHaveBeenCalledWith({ startTime, endTime, minCapacity: 2 });
    expect(await screen.findByText(/Cedar/)).toBeInTheDocument();
    // The confirm button is hidden once a conflict is shown, since the
    // original attempt is now known to be stale.
    expect(screen.queryByRole('button', { name: 'Confirm booking' })).not.toBeInTheDocument();
  });

  it('shows an already-started message for BOOKING_ALREADY_STARTED', async () => {
    vi.mocked(bookingsApi.createBooking).mockRejectedValueOnce(
      new ApiError('BOOKING_ALREADY_STARTED', 409),
    );
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That time has already passed.');
    expect(roomsApi.searchAvailableRooms).not.toHaveBeenCalled();
  });

  it('shows a missing-details banner when required query params are absent', () => {
    render(
      <MemoryRouter initialEntries={['/book']}>
        <Routes>
          <Route path="/book" element={<BookingFormPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Missing booking details. Please search for a room again.',
    );
  });
});
