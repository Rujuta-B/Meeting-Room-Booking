// src/lib/ApiError.test.ts
import { describe, it, expect } from 'vitest';
import { ApiError } from './ApiError';

describe('ApiError', () => {
  it('uses the provided details.message as the Error message', () => {
    const err = new ApiError('VALIDATION_ERROR', 400, { message: 'Bad input.' });
    expect(err.message).toBe('Bad input.');
  });

  it('falls back to the code as the Error message when no details are given', () => {
    const err = new ApiError('UNAUTHORIZED', 401);
    expect(err.message).toBe('UNAUTHORIZED');
  });

  it('exposes code, status, and name', () => {
    const err = new ApiError('BOOKING_CONFLICT', 409);
    expect(err.code).toBe('BOOKING_CONFLICT');
    expect(err.status).toBe(409);
    expect(err.name).toBe('ApiError');
  });

  it('leaves details undefined when none are passed', () => {
    const err = new ApiError('NOT_FOUND', 404);
    expect(err.details).toBeUndefined();
  });

  it('carries structured field errors in details', () => {
    const err = new ApiError('VALIDATION_ERROR', 400, {
      errors: [{ field: 'email', message: 'Email is invalid.' }],
    });
    expect(err.details?.errors).toEqual([{ field: 'email', message: 'Email is invalid.' }]);
  });

  it('is an instanceof Error and ApiError', () => {
    const err = new ApiError('UNKNOWN', 500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });
});
