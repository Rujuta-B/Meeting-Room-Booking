// src/lib/dateRange.test.ts
import { describe, it, expect } from 'vitest';
import { toIsoDateTime, fromIsoDateTime, formatDateTime } from './dateRange';

describe('toIsoDateTime', () => {
  it('combines an IST date and time input into the equivalent UTC ISO string', () => {
    // 10:00 IST = 04:30 UTC (IST is UTC+5:30) - a hardcoded expectation,
    // independent of the test runner's own timezone.
    expect(toIsoDateTime('2026-05-01', '10:00')).toBe('2026-05-01T04:30:00.000Z');
  });

  it('rolls over to the previous UTC calendar day for early IST morning times', () => {
    // 00:30 IST on May 1 is 19:00 UTC on Apr 30.
    expect(toIsoDateTime('2026-05-01', '00:30')).toBe('2026-04-30T19:00:00.000Z');
  });

  it('returns null when the date is missing', () => {
    expect(toIsoDateTime('', '10:00')).toBeNull();
  });

  it('returns null when the time is missing', () => {
    expect(toIsoDateTime('2026-05-01', '')).toBeNull();
  });

  it('returns null when both are missing', () => {
    expect(toIsoDateTime('', '')).toBeNull();
  });
});

describe('fromIsoDateTime', () => {
  it('splits a UTC ISO string back into IST date and time parts', () => {
    // 04:30 UTC = 10:00 IST.
    expect(fromIsoDateTime('2026-05-01T04:30:00.000Z')).toEqual({ date: '2026-05-01', time: '10:00' });
  });

  it('rolls over to the next IST calendar day near the UTC/IST boundary', () => {
    // 20:00 UTC on May 1 is 01:30 IST on May 2.
    expect(fromIsoDateTime('2026-05-01T20:00:00.000Z')).toEqual({ date: '2026-05-02', time: '01:30' });
  });

  it('round-trips through toIsoDateTime', () => {
    const iso = toIsoDateTime('2026-05-01', '10:30') as string;
    expect(fromIsoDateTime(iso)).toEqual({ date: '2026-05-01', time: '10:30' });
  });

  it('returns empty strings for null input', () => {
    expect(fromIsoDateTime(null)).toEqual({ date: '', time: '' });
  });

  it('returns empty strings for undefined input', () => {
    expect(fromIsoDateTime(undefined)).toEqual({ date: '', time: '' });
  });

  it('returns empty strings for an empty string input', () => {
    expect(fromIsoDateTime('')).toEqual({ date: '', time: '' });
  });

  it('pads single-digit month, day, hour, and minute', () => {
    const iso = toIsoDateTime('2026-01-05', '09:05') as string;
    expect(fromIsoDateTime(iso)).toEqual({ date: '2026-01-05', time: '09:05' });
  });
});

describe('formatDateTime', () => {
  it('formats a UTC ISO string as an IST date and time string', () => {
    // 04:30 UTC = 10:00 AM IST.
    const formatted = formatDateTime('2026-05-01T04:30:00.000Z');
    expect(formatted).toContain('2026');
    expect(formatted).toContain('10:00');
  });

  it('shows the IST calendar day, not the UTC one, near the day boundary', () => {
    // 20:00 UTC on May 1 is 01:30 AM IST on May 2 - must read as May 2.
    const formatted = formatDateTime('2026-05-01T20:00:00.000Z');
    expect(formatted).toContain('2');
    expect(formatted).not.toContain('May 1,');
  });
});
