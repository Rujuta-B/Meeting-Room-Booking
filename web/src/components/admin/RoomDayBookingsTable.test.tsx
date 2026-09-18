// src/components/admin/RoomDayBookingsTable.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoomDayBookingsTable } from './RoomDayBookingsTable';
import type { DayTimelineSlot } from '../../types/utilisation';

describe('RoomDayBookingsTable', () => {
  it('renders start/end times in IST, matching what DayTimeline plots for the same slot', () => {
    // Same fixture as DayTimeline.test.tsx's "labels the slot" case, so a
    // future regression that desyncs the two displays fails here too.
    const slots: DayTimelineSlot[] = [
      { bookingId: 'b1', userEmail: 'user@example.com', startTime: '2026-05-02T04:00:00.000Z', endTime: '2026-05-02T10:00:00.000Z' },
    ];

    render(<RoomDayBookingsTable slots={slots} />);

    expect(screen.getByText('9:30 AM')).toBeInTheDocument();
    expect(screen.getByText('3:30 PM')).toBeInTheDocument();
  });

  it('shows the IST time even when it falls on the next UTC calendar day', () => {
    const slots: DayTimelineSlot[] = [
      { bookingId: 'b1', userEmail: 'user@example.com', startTime: '2026-05-01T20:00:00.000Z', endTime: '2026-05-01T20:30:00.000Z' },
    ];

    render(<RoomDayBookingsTable slots={slots} />);

    expect(screen.getByText('1:30 AM')).toBeInTheDocument();
    expect(screen.getByText('2:00 AM')).toBeInTheDocument();
  });

  it('renders nothing when there are no slots', () => {
    const { container } = render(<RoomDayBookingsTable slots={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
