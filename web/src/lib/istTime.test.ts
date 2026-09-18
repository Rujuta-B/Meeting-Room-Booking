// src/lib/istTime.test.ts
import { describe, it, expect } from 'vitest';
import {
  addIstDays,
  firstOfMonthInIst,
  formatIstDate,
  formatIstDateTime,
  formatIstTime,
  istDayUtcRange,
  istMidnightToUtcIso,
  istWallClockToUtcIso,
  todayInIst,
  utcIsoToIstWallClock,
  utcMidnightsSpanningIstDay,
} from './istTime';

describe('formatIstTime', () => {
  it('formats a UTC instant as its IST time-of-day', () => {
    expect(formatIstTime('2026-05-01T04:30:00.000Z')).toBe('10:00 AM');
  });

  it('rolls over to the next IST day near the UTC/IST boundary without shifting the shown time', () => {
    // 20:00 UTC May 1 = 01:30 AM IST May 2 - the critical near-midnight case
    // that caused the bar/table mismatch bug fixed earlier in this project.
    expect(formatIstTime('2026-05-01T20:00:00.000Z')).toBe('1:30 AM');
  });
});

describe('formatIstDate', () => {
  it('shows the IST calendar date, not the UTC one, for a late-UTC-evening instant', () => {
    // 20:00 UTC on May 1 is already May 2 in IST.
    expect(formatIstDate('2026-05-01T20:00:00.000Z')).toBe('May 2, 2026');
  });
});

describe('formatIstDateTime', () => {
  it('combines the IST date and time', () => {
    const formatted = formatIstDateTime('2026-05-01T04:30:00.000Z');
    expect(formatted).toContain('2026');
    expect(formatted).toContain('10:00');
  });
});

describe('istWallClockToUtcIso / istMidnightToUtcIso', () => {
  it('converts IST wall-clock to the correct UTC instant', () => {
    expect(istWallClockToUtcIso('2026-05-01', '10:00')).toBe('2026-05-01T04:30:00.000Z');
  });

  it('computes the UTC instant of IST midnight', () => {
    expect(istMidnightToUtcIso('2026-05-01')).toBe('2026-04-30T18:30:00.000Z');
  });
});

describe('utcIsoToIstWallClock', () => {
  it('is the inverse of istWallClockToUtcIso across the UTC/IST day boundary', () => {
    expect(utcIsoToIstWallClock('2026-05-01T20:00:00.000Z')).toEqual({ date: '2026-05-02', time: '01:30' });
  });
});

describe('todayInIst / firstOfMonthInIst', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayInIst()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns the first of the month matching todayInIst', () => {
    const [year, month] = todayInIst().split('-');
    expect(firstOfMonthInIst()).toBe(`${year}-${month}-01`);
  });
});

describe('istDayUtcRange', () => {
  it('returns the [start, end) UTC instants of the IST calendar day', () => {
    expect(istDayUtcRange('2026-09-18')).toEqual({
      start: '2026-09-17T18:30:00.000Z',
      end: '2026-09-18T18:30:00.000Z',
    });
  });
});

describe('utcMidnightsSpanningIstDay', () => {
  it('returns UTC midnight of the day before and the day itself', () => {
    expect(utcMidnightsSpanningIstDay('2026-09-18')).toEqual(['2026-09-17T00:00:00.000Z', '2026-09-18T00:00:00.000Z']);
  });

  it('the union of the two corresponding UTC calendar days fully covers the IST window', () => {
    const [utcMidnightBefore, utcMidnightOf] = utcMidnightsSpanningIstDay('2026-09-18');
    const { start, end } = istDayUtcRange('2026-09-18');
    const unionStart = utcMidnightBefore;
    const unionEnd = new Date(new Date(utcMidnightOf).getTime() + 24 * 60 * 60 * 1000).toISOString();
    expect(unionStart <= start).toBe(true);
    expect(unionEnd >= end).toBe(true);
  });
});

describe('addIstDays', () => {
  it('advances a plain day', () => {
    expect(addIstDays('2026-05-01', 1)).toBe('2026-05-02');
  });

  it('rolls over a month boundary', () => {
    expect(addIstDays('2026-05-31', 1)).toBe('2026-06-01');
  });

  it('rolls over a year boundary', () => {
    expect(addIstDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
