// src/middleware/authenticate.ts
//
// WHY this exists as middleware, not a check inside each controller: the
// spec requires "no anonymous path" for booking/cancelling - every
// protected route needs the SAME check (valid access token -> req.user)
// before its own logic runs. Putting it in one middleware, attached with
// `router.post('/', authenticate, ...)`, means it's structurally
// impossible to forget on a route that needs it (you'd have to actively
// leave the middleware off), rather than trusting every controller to
// remember to call some helper function itself.
import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  // Expect "Authorization: Bearer <token>" - the standard convention. We
  // read the access token from a header (not a cookie) because the access
  // token deliberately lives only in the frontend's memory/JS state, never
  // in a cookie - see auth.controller.ts for why only the REFRESH token
  // gets the httpOnly-cookie treatment.
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header.');
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    // jwt.verify throws on expiry, bad signature, malformed token, etc -
    // we deliberately don't distinguish those reasons to the client (that
    // would leak information about why a token was rejected); the
    // frontend's response is the same either way: treat this as "not
    // authenticated" and try a silent refresh.
    throw new UnauthorizedError('Invalid or expired access token.');
  }
}
