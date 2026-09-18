// src/lib/duration.test.ts
import { describe, it, expect } from 'vitest';
import { formatHoursAsHm } from './duration';

describe('formatHoursAsHm', () => {
  it('formats a whole hour', () => {
    expect(formatHoursAsHm(1)).toBe('1:00');
  });

  it('formats a sub-hour duration without losing minutes', () => {
    expect(formatHoursAsHm(4 / 60)).toBe('0:04');
  });

  it('formats a duration spanning multiple hours and minutes', () => {
    expect(formatHoursAsHm(2.5)).toBe('2:30');
  });

  it('formats zero', () => {
    expect(formatHoursAsHm(0)).toBe('0:00');
  });

  it('rounds to the nearest minute', () => {
    expect(formatHoursAsHm(0.75)).toBe('0:45');
  });
});
