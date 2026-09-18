// src/lib/floor.test.ts
import { describe, it, expect } from 'vitest';
import { MIN_FLOOR, MAX_FLOOR, FLOOR_OPTIONS, formatFloorLabel } from './floor';

describe('FLOOR_OPTIONS', () => {
  it('lists every floor from MIN_FLOOR to MAX_FLOOR inclusive', () => {
    expect(FLOOR_OPTIONS).toEqual([1, 2, 3, 4, 5]);
  });

  it('matches the exported bounds', () => {
    expect(FLOOR_OPTIONS[0]).toBe(MIN_FLOOR);
    expect(FLOOR_OPTIONS[FLOOR_OPTIONS.length - 1]).toBe(MAX_FLOOR);
  });
});

describe('formatFloorLabel', () => {
  it('formats 1 as "1st floor"', () => {
    expect(formatFloorLabel(1)).toBe('1st floor');
  });

  it('formats 2 as "2nd floor"', () => {
    expect(formatFloorLabel(2)).toBe('2nd floor');
  });

  it('formats 3 as "3rd floor"', () => {
    expect(formatFloorLabel(3)).toBe('3rd floor');
  });

  it('formats 4 as "4th floor"', () => {
    expect(formatFloorLabel(4)).toBe('4th floor');
  });

  it('special-cases the 11th-13th teens as "th", not "st"/"nd"/"rd"', () => {
    expect(formatFloorLabel(11)).toBe('11th floor');
    expect(formatFloorLabel(12)).toBe('12th floor');
    expect(formatFloorLabel(13)).toBe('13th floor');
  });

  it('resumes st/nd/rd after the teens (21, 22, 23)', () => {
    expect(formatFloorLabel(21)).toBe('21st floor');
    expect(formatFloorLabel(22)).toBe('22nd floor');
    expect(formatFloorLabel(23)).toBe('23rd floor');
  });

  it('formats a multiple of 100 plus a teen remainder as "th" (111)', () => {
    expect(formatFloorLabel(111)).toBe('111th floor');
  });
});
