// src/components/DatePicker.test.tsx
//
// Regression test for the bug that made the shorten-booking flow appear
// completely unusable: the calendar's "disable past dates" boundary used
// to be computed from the JS engine's LOCAL "today" (new Date() +
// setHours(0,0,0,0)) instead of IST's "today", even though every value fed
// into this component (`value`, `max`) is an IST calendar date string. This
// test pins the system clock to an instant that is a different calendar
// date in IST than in a non-IST local timezone, and asserts the calendar's
// enabled/disabled boundary follows IST, matching todayInIst() in
// lib/istTime.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DatePicker } from './DatePicker';

describe('DatePicker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 20:00 UTC on Sep 18 is already 01:30 AM IST on Sep 19, but still
    // Sep 18 in the test suite's configured non-IST local timezone
    // (vite.config.ts sets TZ: 'America/New_York') - exactly the boundary
    // that exposes a local-time vs. IST-time bug.
    vi.setSystemTime(new Date('2026-09-18T20:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('disables dates before IST "today", not the local timezone\'s "today"', () => {
    const onChange = vi.fn();

    render(<DatePicker value="" onChange={onChange} disablePast />);
    fireEvent.click(screen.getByRole('button', { name: 'Select a date' }));

    // IST "today" is Sep 19 - Sep 18 must be disabled even though it is
    // still "today" by the local (non-IST) system clock.
    expect(screen.getByRole('gridcell', { name: /18/ }).querySelector('button')).toBeDisabled();
    // Sep 19 (IST today) must remain selectable.
    expect(screen.getByRole('gridcell', { name: /19/ }).querySelector('button')).toBeEnabled();
  });

  it('labels the selected date from its own YYYY-MM-DD parts, independent of local timezone', () => {
    const onChange = vi.fn();
    render(<DatePicker value="2026-09-19" onChange={onChange} />);

    expect(screen.getByRole('button', { name: /Sat, Sep 19, 2026/ })).toBeInTheDocument();
  });
});
