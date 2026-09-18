// src/components/admin/DayTimeline.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DayTimeline } from './DayTimeline';
import type { DayTimelineSlot } from '../../types/utilisation';

describe('DayTimeline', () => {
  it('positions a slot by its IST time, not its UTC time', () => {
    // 20:00 UTC on May 1 is 01:30 AM IST on May 2 - for the May 2 IST day,
    // this slot should sit near the start of the bar (~6.25%), not near the
    // end as it would if the axis were still UTC-anchored.
    const slots: DayTimelineSlot[] = [
      { bookingId: 'b1', userEmail: 'user@example.com', startTime: '2026-05-01T20:00:00.000Z', endTime: '2026-05-01T20:30:00.000Z' },
    ];

    const { container } = render(<DayTimeline slots={slots} date="2026-05-02" />);

    const slot = container.querySelector('.day-timeline-slot') as HTMLElement;
    const left = parseFloat(slot.style.left);
    // 01:30 into a 24h day = 6.25%.
    expect(left).toBeCloseTo(6.25, 1);
  });

  it('does not place a slot on the bar for the wrong IST day', () => {
    // Same instant, but requesting the May 1 IST day - this slot belongs to
    // May 2 IST, so it should be clamped to the very edge (0%), not appear
    // mid-bar as it would under UTC-day anchoring.
    const slots: DayTimelineSlot[] = [
      { bookingId: 'b1', userEmail: 'user@example.com', startTime: '2026-05-01T20:00:00.000Z', endTime: '2026-05-01T20:30:00.000Z' },
    ];

    const { container } = render(<DayTimeline slots={slots} date="2026-05-01" />);
    const slot = container.querySelector('.day-timeline-slot') as HTMLElement;
    expect(parseFloat(slot.style.left)).toBe(100);
  });

  it('labels the slot with its IST time', () => {
    const slots: DayTimelineSlot[] = [
      { bookingId: 'b1', userEmail: 'user@example.com', startTime: '2026-05-02T04:00:00.000Z', endTime: '2026-05-02T10:00:00.000Z' },
    ];

    render(<DayTimeline slots={slots} date="2026-05-02" />);

    // 04:00 UTC = 9:30 AM IST, 10:00 UTC = 3:30 PM IST.
    expect(screen.getAllByText(/9:30 AM.*3:30 PM/)).toHaveLength(2);
  });
});
