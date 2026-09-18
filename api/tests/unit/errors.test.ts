// tests/unit/errors.test.ts
//
// Pure unit tests for src/lib/errors.ts - no database, no HTTP, no
// createTestApp()/resetDatabase(). These just construct the error classes
// and factory functions directly and assert on the shape they produce,
// since that shape (statusCode/code/message/details) is the entire
// contract errorHandler.ts and the frontend rely on (see errors.ts's
// top-of-file comment).
import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  bookingConflictError,
  bookingAlreadyStartedError,
  roomDuplicateError,
  notAShortenError,
} from '../../src/lib/errors.js';

describe('error factory functions', () => {
  it('bookingConflictError() produces a 409 BOOKING_CONFLICT', () => {
    const err = bookingConflictError();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('BOOKING_CONFLICT');
    expect(err.message).toBe('This room is already booked for part or all of the requested time range.');
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toBeInstanceOf(AppError);
  });

  it('bookingAlreadyStartedError() produces a 409 BOOKING_ALREADY_STARTED', () => {
    const err = bookingAlreadyStartedError();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('BOOKING_ALREADY_STARTED');
    expect(err.message).toBe('This booking has already started and can no longer be shortened or cancelled.');
  });

  it('roomDuplicateError() produces a 409 ROOM_DUPLICATE', () => {
    const err = roomDuplicateError();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('ROOM_DUPLICATE');
    expect(err.message).toBe('A room with this name already exists on this floor.');
  });

  it('notAShortenError() produces a 400 VALIDATION_ERROR with a details.errors array', () => {
    const err = notAShortenError();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.details).toEqual({
      errors: [{ field: 'endTime', message: "The new end time must be earlier than the booking's current end time." }],
    });
  });
});

describe('AppError subclass constructors', () => {
  it('ValidationError constructs with statusCode 400 and code VALIDATION_ERROR', () => {
    const err = new ValidationError([{ field: 'foo', message: 'bad foo' }]);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual({ errors: [{ field: 'foo', message: 'bad foo' }] });
  });

  it('UnauthorizedError constructs with statusCode 401 and code UNAUTHORIZED', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('Authentication required.');
  });

  it('UnauthorizedError accepts a custom message', () => {
    const err = new UnauthorizedError('Malformed access token payload.');
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Malformed access token payload.');
  });

  it('ForbiddenError constructs with statusCode 403 and code FORBIDDEN', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('You do not have permission to perform this action.');
  });

  it('NotFoundError constructs with statusCode 404 and code NOT_FOUND', () => {
    const err = new NotFoundError('Room');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Room not found.');
  });

  it('every AppError instance has .name set to its own constructor name', () => {
    expect(new ValidationError([]).name).toBe('ValidationError');
    expect(new UnauthorizedError().name).toBe('UnauthorizedError');
    expect(new ForbiddenError().name).toBe('ForbiddenError');
    expect(new NotFoundError('Booking').name).toBe('NotFoundError');
    expect(new ConflictError('SOME_CODE', 'some message').name).toBe('ConflictError');
    expect(bookingConflictError().name).toBe('ConflictError');
  });
});
