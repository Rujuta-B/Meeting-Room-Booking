// src/middleware/errorHandler.ts
//
// WHY one centralized error handler instead of try/catch + res.json in
// every controller: without this, every single controller needs its own
// try/catch that duplicates "figure out the status code, shape the JSON,
// log it." That's both repetitive AND risky - it's easy for one controller
// to forget a case and leak a raw stack trace to the client, or return an
// inconsistent error shape the frontend can't reliably switch on. Instead,
// controllers just `throw` (or let an `await` reject) and Express routes
// any error to this ONE place (registered LAST in app.ts, after all
// routes) via its special 4-argument error-middleware signature.
import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError, bookingConflictError } from '../lib/errors.js';

// Postgres's SQLSTATE code for "exclusion_violation" - the exact, specific
// error the EXCLUDE constraint raises when an INSERT/UPDATE would create an
// overlapping CONFIRMED booking for the same room. This one string is the
// entire bridge between "a database constraint fired" and "the API returns
// a clean, specific 409" - see the migration SQL
// (prisma/migrations/<ts>_add_booking_exclusion_constraint) for where this
// error originates, and bookings.service.ts for where the raw SQL insert
// that can trigger it lives.
const POSTGRES_EXCLUSION_VIOLATION = '23P01';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // Case 1: an error we threw on purpose (ValidationError, ConflictError,
  // NotFoundError, ...) - it already knows its own status code and public
  // error `code`, so just relay it.
  if (err instanceof AppError) {
    // 4xx errors are expected, routine client mistakes/conflicts - log at
    // 'warn', not 'error', so real server-side bugs (5xx) stand out in the
    // logs instead of being buried under routine 404s/409s. The booking
    // conflict case specifically doubles as the "rejected double-booking
    // attempt" audit trail the spec asks for.
    req.log.warn(
      { err: { code: err.code, message: err.message }, statusCode: err.statusCode },
      'Request failed with a handled error',
    );
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, ...(err.details ? (err.details as object) : {}) },
    });
    return;
  }

  // Case 2: the booking insert/update hit the EXCLUDE constraint directly.
  // Because bookings.service.ts uses prisma.$executeRaw (not the typed
  // .create()/.update() client API - see that file for why), a constraint
  // violation surfaces as a PrismaClientKnownRequestError with the generic
  // "raw query failed" code P2010, carrying the ORIGINAL Postgres SQLSTATE
  // at err.meta.code. We check for that SPECIFIC nested code and translate
  // it to the clean, documented BOOKING_CONFLICT response - this is the
  // one place in the whole app where "a low-level DB error" becomes "a
  // specific API contract the frontend can act on," exactly as the spec
  // requires ("not a generic error and not a silent success"). Note: this
  // relies on the constraint firing SYNCHRONOUSLY at statement time, which
  // is the default (our migration does not mark it DEFERRABLE) - a
  // deferred constraint checked at COMMIT time inside an interactive
  // transaction is a known edge case where Prisma has historically failed
  // to surface an error at all, which is exactly why createBooking() does
  // NOT wrap this insert in an unnecessary transaction.
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    // P2010 is Prisma's GENERIC "a raw query failed" code - it fires for
    // any Postgres error $executeRaw/$queryRaw doesn't have a specific
    // typed mapping for (Prisma has no built-in concept of
    // exclusion_violation, since EXCLUDE constraints aren't expressible in
    // schema.prisma at all). The ORIGINAL Postgres SQLSTATE is carried
    // through untouched at err.meta.code - THAT'S the field that actually
    // tells us which Postgres error this was, not err.code itself.
    err.code === 'P2010' &&
    (err.meta as { code?: string } | undefined)?.code === POSTGRES_EXCLUSION_VIOLATION
  ) {
    const conflict = bookingConflictError();
    req.log.warn({ err: { code: conflict.code } }, 'Rejected a double-booking attempt (exclusion constraint)');
    res.status(conflict.statusCode).json({ error: { code: conflict.code, message: conflict.message } });
    return;
  }

  // Case 3: genuinely unexpected - a real bug, a DB connection drop, etc.
  // Log the FULL error (including stack) at 'error' level for debugging,
  // but never send the raw error/stack trace to the client - that can leak
  // internal details (file paths, query text, library versions) to
  // whoever is calling the API.
  req.log.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
}
