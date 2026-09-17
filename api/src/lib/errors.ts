// src/lib/errors.ts
//
// WHY a hierarchy of typed error classes instead of throwing plain
// strings/Error objects everywhere: the centralized error handler
// (middleware/errorHandler.ts) needs a reliable way to know "what HTTP
// status and error `code` should this become?" without re-parsing message
// text. A service function does `throw new ConflictError(...)`, and the
// error handler just checks `err instanceof AppError` and reads
// `err.statusCode` / `err.code` - no guessing, no string matching. This is
// also exactly what makes the frontend's error handling possible: the
// `code` field on each of these is a stable contract the UI switches on
// (see BookingConflictBanner etc.) instead of matching on human-readable
// message text, which is free to change wording without breaking anything.

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

// 400 - "the request itself is malformed" (bad shape, bad types, end
// before start, etc). Caught before any business logic runs, per the
// validate() middleware.
export class ValidationError extends AppError {
  constructor(errors: Array<{ field: string; message: string }>) {
    super(400, 'VALIDATION_ERROR', 'The request failed validation.', { errors });
  }
}

// 401 - "we don't know who you are" (missing/invalid/expired token).
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.') {
    super(401, 'UNAUTHORIZED', message);
  }
}

// 403 - "we know who you are, and you're not allowed to do this" -
// distinct from 401 on purpose: a valid, logged-in user hitting someone
// else's booking is a DIFFERENT failure mode than an anonymous request,
// and the frontend/logs should be able to tell them apart.
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super(403, 'FORBIDDEN', message);
  }
}

// 404 - the referenced resource (room, booking) doesn't exist at all.
export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found.`);
  }
}

// 409 - "your request is individually valid, but conflicts with existing
// state." Two distinct sub-cases the spec calls out, each with its own
// `code` so the frontend can render a different message for each:
export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(409, code, message);
  }
}

export function bookingConflictError(): ConflictError {
  return new ConflictError(
    'BOOKING_CONFLICT',
    'This room is already booked for part or all of the requested time range.',
  );
}

export function bookingAlreadyStartedError(): ConflictError {
  return new ConflictError(
    'BOOKING_ALREADY_STARTED',
    'This booking has already started and can no longer be shortened or cancelled.',
  );
}

// Backed by the rooms(name, floor) unique constraint (see rooms.service.ts,
// which catches Prisma's P2002 and throws this) - distinct rooms may share
// a name across different floors, but not both at once.
export function roomDuplicateError(): ConflictError {
  return new ConflictError(
    'ROOM_DUPLICATE',
    'A room with this name already exists on this floor.',
  );
}

// A 400, not a 409: "the new end time isn't actually earlier than the
// current one" is a malformed request for the /shorten endpoint
// specifically (the same CLASS of problem as end-before-start on booking
// creation), not a conflict with some OTHER existing state - there is
// nothing to retry or resolve, the request itself doesn't make sense for
// what this endpoint does. Kept as its own function (not reusing
// bookingAlreadyStartedError, which is a 409 about TIMING, a different
// concept from this being about the REQUESTED VALUE not shrinking anything).
export function notAShortenError(): ValidationError {
  return new ValidationError([
    { field: 'endTime', message: 'The new end time must be earlier than the booking\'s current end time.' },
  ]);
}
