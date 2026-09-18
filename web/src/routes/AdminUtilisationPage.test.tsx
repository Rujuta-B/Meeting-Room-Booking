// src/routes/AdminUtilisationPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminUtilisationPage } from './AdminUtilisationPage';
import * as adminApi from '../api/admin';
import * as roomsApi from '../api/rooms';
import type { Room } from '../types/room';
import type { DayTimelineSlot } from '../types/utilisation';

vi.mock('../api/admin');
vi.mock('../api/rooms');

const ROOM: Room = { id: 'room-1', name: 'Sunflower', floor: 1, capacity: 4, attributes: [] };

describe('AdminUtilisationPage day timeline', () => {
  beforeEach(() => {
    vi.mocked(roomsApi.listRooms).mockReset();
    vi.mocked(roomsApi.listRooms).mockResolvedValue({
      rooms: [ROOM],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    });
    vi.mocked(adminApi.getRoomDayTimeline).mockReset();
  });

  it('finds a booking that falls in a different UTC calendar day than the requested IST date', async () => {
    // Regression test for a real reported bug: a booking made at
    // 10:57-11:00 AM IST on Sep 18 (05:27-05:30 UTC, also Sep 18 in UTC)
    // went missing from the Sep 18 IST timeline because the page was
    // querying the backend's UTC-day endpoint with IST midnight's UTC
    // instant (18:30 UTC Sep 17), which the backend treats as "UTC day
    // Sep 17" - entirely the wrong window. The page must now query both
    // UTC calendar days the IST day spans and merge the results.
    const slot: DayTimelineSlot = {
      bookingId: 'b1',
      userEmail: 'user@example.com',
      startTime: '2026-09-18T05:27:00.000Z',
      endTime: '2026-09-18T05:30:00.000Z',
    };

    vi.mocked(adminApi.getRoomDayTimeline).mockImplementation(async (_roomId, date) => {
      // Only the query for UTC calendar day Sep 18 should surface this slot -
      // a real backend would only return it for that day's window.
      return { slots: date.startsWith('2026-09-18') ? [slot] : [] };
    });

    const user = userEvent.setup();
    render(<AdminUtilisationPage />);

    const timelineRoomSelect = await screen.findByText('Select a room…');
    await user.click(timelineRoomSelect);
    await user.click(await screen.findByRole('option', { name: 'Sunflower' }));

    expect(await screen.findByText('user@example.com')).toBeInTheDocument();
    expect(screen.getByText('10:57 AM')).toBeInTheDocument();
    expect(screen.getByText('11:00 AM')).toBeInTheDocument();

    // Confirm it queried both UTC calendar days spanning IST "today".
    const queriedDates = vi.mocked(adminApi.getRoomDayTimeline).mock.calls.map(([, date]) => date);
    expect(queriedDates).toHaveLength(2);
    const utcDates = queriedDates.map((d) => d.slice(0, 10)).sort();
    const [first, second] = utcDates;
    expect(second).toBeDefined();
    const dayApart = (new Date(`${second}T00:00:00Z`).getTime() - new Date(`${first}T00:00:00Z`).getTime()) / 86400000;
    expect(dayApart).toBe(1);
  });
});
