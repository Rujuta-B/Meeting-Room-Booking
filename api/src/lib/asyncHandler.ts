// src/lib/asyncHandler.ts
//
// WHY this wrapper exists: Express 4 (what this app uses) does NOT
// automatically catch a rejected Promise returned by an async route
// handler. If an `async function controller(req, res) { ... throw X ... }`
// throws inside an `await`, that becomes an unhandled promise rejection -
// it never reaches errorHandler.ts, and the request just hangs until it
// times out, with the error only visible as a process-level warning. This
// tiny wrapper catches any rejection and forwards it to `next(err)`, which
// IS how Express routes errors to the centralized error handler. Every
// async controller in this app is wrapped with this - it's the one bit of
// boilerplate that makes "just throw an AppError from a service" reliably
// work end-to-end.
import type { NextFunction, Request, Response } from 'express';

// Generic over Express's own Request type parameters (route params, res
// body, req body, query) rather than the plain, un-parameterized
// `Request`. Controllers are typed with specific shapes (e.g.
// `Request<{ id: string }, unknown, ShortenBookingInput>`) so that
// `req.params.id` and `req.body` are checked at compile time - a generic
// wrapper is what lets asyncHandler accept any of those more specific
// handler types without TypeScript widening them back down to the
// generic/unsafe defaults.
type AsyncRouteHandler<P = never, ResBody = unknown, ReqBody = unknown, ReqQuery = unknown> = (
  req: Request<P, ResBody, ReqBody, ReqQuery>,
  res: Response<ResBody>,
  next: NextFunction,
) => Promise<unknown>;

export function asyncHandler<P = never, ResBody = unknown, ReqBody = unknown, ReqQuery = unknown>(
  handler: AsyncRouteHandler<P, ResBody, ReqBody, ReqQuery>,
) {
  return (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response<ResBody>, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}
