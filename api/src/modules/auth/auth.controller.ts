// src/modules/auth/auth.controller.ts
//
// The controller's ONLY job: translate between HTTP (req/res) and the
// service layer's plain function calls. It knows about cookies and status
// codes; it does NOT know about bcrypt, JWT internals, or Prisma - that
// separation is what makes auth.service.ts independently testable and
// reusable if we ever added a second entry point (a CLI, a second API
// version, etc).
import type { Request, Response } from 'express';
import { env, isProduction } from '../../config/env.js';
import * as authService from './auth.service.js';
import type { RegisterInput, LoginInput } from './auth.schemas.js';

// Cookie attributes are IDENTICAL across register/login/refresh (setting)
// and logout (clearing) - extracted once so they can never drift out of
// sync between the two (a mismatch there is a classic bug: clearCookie
// silently does nothing if its options don't exactly match how the cookie
// was set).
const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true, // no JS (including an XSS payload) can read this cookie - see auth.service.ts / the plan for the full reasoning
  secure: isProduction, // browsers silently drop `Secure` cookies over plain http, which local dev uses
  sameSite: 'strict' as const, // no cross-site navigation ever needs to carry this cookie for this app
  // Scoped to /auth, not narrower to /auth/refresh: it must reach BOTH
  // /auth/refresh (to be read) AND /auth/logout (to be revoked there).
  // Browsers match cookie paths by PREFIX, not by "belongs to the same
  // feature" - a cookie scoped to /auth/refresh is never sent on a request
  // to the sibling path /auth/logout, which would make logoutHandler below
  // always see an empty cookie and silently fail to revoke the token
  // server-side (the browser would still forget it locally via
  // clearCookie, so logout would LOOK like it worked while the token
  // stayed valid for the rest of its lifetime - the kind of bug that's
  // invisible until someone specifically checks server-side state). /auth
  // is still far narrower than the default (every route on the API) - it
  // is never attached to /rooms, /bookings, etc.
  path: '/auth',
};

function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...REFRESH_COOKIE_OPTIONS, expires: expiresAt });
}

// WHY the JSON body only ever contains { user, accessToken } - never the
// refresh token: that's the entire point of splitting the two token types
// across two transport mechanisms. If the refresh token appeared in the
// body, any script running on the page (including an injected XSS payload)
// could read it via the fetch response - defeating the httpOnly cookie
// protection entirely, since the same secret would also be sitting in
// plain JS-readable JSON.
function sendAuthResult(res: Response, status: number, result: Awaited<ReturnType<typeof authService.register>>): void {
  setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
  res.status(status).json({ user: result.user, accessToken: result.accessToken });
}

export async function registerHandler(req: Request<unknown, unknown, RegisterInput>, res: Response): Promise<void> {
  const result = await authService.register(req.body);
  req.log.info({ userId: result.user.id }, 'User registered');
  sendAuthResult(res, 201, result);
}

export async function loginHandler(req: Request<unknown, unknown, LoginInput>, res: Response): Promise<void> {
  const result = await authService.login(req.body);
  req.log.info({ userId: result.user.id }, 'User logged in');
  sendAuthResult(res, 200, result);
}

export async function refreshHandler(req: Request, res: Response): Promise<void> {
  // The refresh token travels ONLY via the httpOnly cookie - never read
  // from the body or a header here. That's what makes the frontend's
  // `fetch('/auth/refresh', { credentials: 'include' })` work without the
  // frontend ever having direct access to the token value itself.
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!rawRefreshToken) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No refresh token provided.' } });
    return;
  }

  const result = await authService.refresh(rawRefreshToken);
  req.log.info({ userId: result.user.id }, 'Access token refreshed');
  sendAuthResult(res, 200, result);
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  await authService.logout(rawRefreshToken);
  // clearCookie's options must match the ones used in res.cookie(), MINUS
  // `expires`/`maxAge` (clearCookie sets its own expiry in the past to
  // delete it) - mismatched `path`/`sameSite`/`secure` here is the classic
  // reason "logout" appears to succeed but the cookie silently survives.
  res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
  req.log.info('User logged out');
  res.status(204).send();
}
