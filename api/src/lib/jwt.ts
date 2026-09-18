// src/lib/jwt.ts
//
// WHY two token TYPES (access + refresh) instead of one long-lived token:
// a single long-lived token that's stolen (e.g. via XSS) is valid for as
// long as it lasts - days or weeks. Splitting into a SHORT-lived access
// token (minutes) + a LONGER-lived refresh token limits how long a stolen
// ACCESS token is useful for, while the refresh token - the one that
// actually needs to survive - never touches frontend JS at all (see
// auth.controller.ts: it's set as an httpOnly cookie, never returned in a
// JSON body a script could read). This file only handles signing/verifying
// the JWTs themselves; the httpOnly-cookie mechanics live in the auth
// module, and refresh-token revocation lives in the RefreshToken table.
import jwt, { type SignOptions } from 'jsonwebtoken';
import ms from 'ms';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { UnauthorizedError } from './errors.js';

// WHY this is derived from JWT_REFRESH_EXPIRES_IN via the SAME `ms`
// library jsonwebtoken itself uses to parse that string, rather than a
// second, separately-configured env var: auth.service.ts needs a real
// Date (refreshTokenExpiresAt) to store in the refresh_tokens table -
// "7d" isn't directly usable for a DB column. An earlier version of this
// file had a SEPARATE env var (JWT_REFRESH_EXPIRES_IN_DAYS) just for that
// computation - two independently-configured values describing the same
// lifetime, with nothing enforcing they stayed in sync. Deriving this
// value from the one duration string that also signs the JWT means the
// signed token's own expiry and the DB row's revocation-check expiry can
// never disagree - there is exactly one place this lifetime is set.
export const REFRESH_TOKEN_TTL_MS = ms(env.JWT_REFRESH_EXPIRES_IN);

const AccessTokenPayloadSchema = z.object({
  sub: z.string(), // user id
  role: z.enum(['USER', 'ADMIN']),
});
export type AccessTokenPayload = z.infer<typeof AccessTokenPayloadSchema>;

const RefreshTokenPayloadSchema = z.object({
  sub: z.string(), // user id
  // A random id embedded in the token itself, matched against the hashed
  // row in the refresh_tokens table. Without this, we'd have to hash and
  // look up by the *entire* token string, which works too - this field
  // just makes intent explicit: "this JWT corresponds to exactly one DB
  // row, and that row is what actually controls whether it's still valid."
  jti: z.string(),
});
export type RefreshTokenPayload = z.infer<typeof RefreshTokenPayloadSchema>;

// WHY the `as SignOptions['expiresIn']` cast: @types/jsonwebtoken types
// `expiresIn` as a specific template-literal union (e.g. "15m" | "7d" | a
// plain number of seconds), not a general `string`. Our env.ts already
// validates these values ARE well-formed duration strings at startup (via
// zod, with the app refusing to boot otherwise) - this cast tells
// TypeScript what we already know to be true at runtime, rather than
// papering over a real type mismatch.
export function signAccessToken(payload: AccessTokenPayload): string {
  // A random jti is embedded (but never looked up anywhere, unlike the
  // refresh token's jti) purely to guarantee token uniqueness: a JWT's
  // only other source of per-token variation is `iat`, which the JWT spec
  // truncates to whole seconds. Two access tokens legitimately issued for
  // the same user within the same second (e.g. register immediately
  // followed by a refresh) would otherwise be byte-for-byte identical -
  // "issue a new token" could silently produce one indistinguishable from
  // the one it was meant to replace. verifyAccessToken below re-validates
  // against AccessTokenPayloadSchema (no jti field), so this extra field
  // is simply dropped on the way back out - callers never see it.
  // jsonwebtoken's SignOptions['expiresIn'] union resolves to an error-like
  // type after this cast; the cast itself is the documented, deliberate
  // workaround above, not a real unsafe value.
  /* eslint-disable @typescript-eslint/no-unsafe-assignment */
  return jwt.sign({ ...payload, jti: randomUUID() }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  });
  /* eslint-enable @typescript-eslint/no-unsafe-assignment */
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  // See signAccessToken above.
  /* eslint-disable @typescript-eslint/no-unsafe-assignment */
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  });
  /* eslint-enable @typescript-eslint/no-unsafe-assignment */
}

// WHY the decoded payload is re-validated with zod, not just cast with
// `as`: jwt.verify() proves the token was SIGNED by us and hasn't expired
// - it says nothing about the SHAPE of the data inside it. A bare `as
// AccessTokenPayload` cast would trust that shape blindly; if signing code
// ever changed (a typo'd field name, a payload built from a different
// source) without every call site being updated in lockstep, a
// structurally wrong payload would silently propagate `undefined` into
// req.user.id / req.user.role rather than fail loudly at the one place
// that could have caught it. Parsing with the same schema used to type
// the payload turns that class of bug into an immediate, clear
// UnauthorizedError instead of a confusing failure somewhere downstream.
export function verifyAccessToken(token: string): AccessTokenPayload {
  // jwt.verify throws (TokenExpiredError / JsonWebTokenError) on anything
  // invalid - the caller (authenticate middleware) turns that into a clean
  // 401 rather than letting a raw JWT library error leak to the client.
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
  const result = AccessTokenPayloadSchema.safeParse(decoded);
  if (!result.success) throw new UnauthorizedError('Malformed access token payload.');
  return result.data;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
  const result = RefreshTokenPayloadSchema.safeParse(decoded);
  if (!result.success) throw new UnauthorizedError('Malformed refresh token payload.');
  return result.data;
}
