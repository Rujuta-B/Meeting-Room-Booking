// src/lib/capacity.test.ts
import { describe, it, expect } from 'vitest';
import { MIN_CAPACITY, MAX_CAPACITY } from './capacity';

describe('capacity constants', () => {
  it('sets the floor to 2, since a one-person room is not a meeting room', () => {
    expect(MIN_CAPACITY).toBe(2);
  });

  it('sets the cap to 500', () => {
    expect(MAX_CAPACITY).toBe(500);
  });

  it('keeps the floor below the cap', () => {
    expect(MIN_CAPACITY).toBeLessThan(MAX_CAPACITY);
  });
});
