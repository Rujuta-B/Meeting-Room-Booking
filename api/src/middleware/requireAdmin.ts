// src/middleware/requireAdmin.ts
//
// WHY this is a SEPARATE middleware from authenticate, always used AFTER
// it (router.get('/x', authenticate, requireAdmin, ...)): authentication
// ("who are you") and authorization ("are you allowed to do THIS") are two
// different questions. Keeping them as two small middlewares that compose
// means a route can require "any logged-in user" (authenticate alone) or
// "an admin specifically" (authenticate + requireAdmin) without duplicating
// the token-verification logic in a combined check. requireAdmin assumes
// req.user already exists - it must run after authenticate, never instead
// of it.
import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) {
    // Defensive check: this should be unreachable if the route is wired
    // correctly (authenticate always runs first), but fail loudly with a
    // clear error rather than crashing on `req.user.role` if a route is
    // ever misconfigured.
    throw new UnauthorizedError();
  }

  if (req.user.role !== 'ADMIN') {
    throw new ForbiddenError('This action requires administrator access.');
  }

  next();
}
