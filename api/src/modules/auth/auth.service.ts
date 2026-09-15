// src/modules/auth/auth.service.ts
//
// All the actual business logic for register/login/refresh/logout lives
// here, kept separate from auth.controller.ts (which only translates
// HTTP <-> these function calls) and auth.routes.ts (which only wires
// middleware). This is the "service" layer described in the plan: the
// controller doesn't know about bcrypt, JWTs, or Prisma directly.
import bcrypt from 'bcryptjs';
import { randomUUID, createHash } from 'node:crypto';
import { prisma } from '../../prisma/client.js';
import { env } from '../../config/env.js';
import { ConflictError, UnauthorizedError } from '../../lib/errors.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  type AccessTokenPayload,
} from '../../lib/jwt.js';
import type { RegisterInput, LoginInput } from './auth.schemas.js';

interface AuthResult {
  user: { id: string; email: string; role: 'USER' | 'ADMIN' };
  accessToken: string;
  refreshToken: string; // the RAW token - the controller puts this in a cookie, never the body
  refreshTokenExpiresAt: Date;
}

// WHY we hash the refresh token before storing it (same idea as password
// hashing): the refresh_tokens table is the thing an attacker gets if the
// database itself is ever compromised. If we stored raw tokens, that leak
// alone would hand out valid, long-lived credentials. Hashing means the
// stored value is useless without the original token, which never touches
// the database.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function issueTokenPair(userId: string, role: 'USER' | 'ADMIN'): Promise<Pick<AuthResult, 'accessToken' | 'refreshToken' | 'refreshTokenExpiresAt'>> {
  const accessPayload: AccessTokenPayload = { sub: userId, role };
  const accessToken = signAccessToken(accessPayload);

  // jti = a fresh random id per refresh token issued, so each token maps
  // to exactly one row in refresh_tokens - see jwt.ts for the full
  // reasoning.
  const jti = randomUUID();
  const refreshToken = signRefreshToken({ sub: userId, jti });

  // Derived from the SAME duration string that signs the JWT itself (see
  // lib/jwt.ts's REFRESH_TOKEN_TTL_MS comment) - the JWT's own expiry and
  // this DB row's expiresAt can never drift out of sync, because there is
  // only one source of truth for how long a refresh token lives.
  const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await prisma.refreshToken.create({
    data: {
      id: jti, // reuse the jti as the row id so lookups by jti are a primary-key lookup, not a scan
      tokenHash: hashToken(refreshToken),
      userId,
      expiresAt: refreshTokenExpiresAt,
    },
  });

  return { accessToken, refreshToken, refreshTokenExpiresAt };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    // A 409 (not 400) - the individual fields are valid, they just
    // conflict with an existing row. This mirrors the same 400-vs-409
    // distinction used for bookings: 400 = malformed request, 409 =
    // valid request that collides with existing state.
    throw new ConflictError('EMAIL_TAKEN', 'An account with this email already exists.');
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { email: input.email, passwordHash },
  });

  const tokens = await issueTokenPair(user.id, user.role);

  return { user: { id: user.id, email: user.email, role: user.role }, ...tokens };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // WHY we compare against a fixed bcrypt hash even when the user doesn't
  // exist (rather than returning immediately): bcrypt.compare takes a
  // roughly constant amount of time regardless of whether the hash
  // "matches." Returning early on "user not found" would make login
  // measurably FASTER for nonexistent emails than for wrong passwords on
  // real accounts - a timing side-channel that lets an attacker enumerate
  // which emails have accounts. Always doing the compare (against a dummy
  // hash if there's no user) keeps the response time consistent either way.
  const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8pmDh3zMepP8ZOFlLmHNGe/pFhkjKm';
  const isValid = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !isValid) {
    // Same error for "no such user" and "wrong password" - again, so the
    // response doesn't reveal which one it was.
    throw new UnauthorizedError('Invalid email or password.');
  }

  const tokens = await issueTokenPair(user.id, user.role);

  return { user: { id: user.id, email: user.email, role: user.role }, ...tokens };
}

export async function refresh(rawRefreshToken: string): Promise<AuthResult> {
  let payload;
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw new UnauthorizedError('Invalid or expired refresh token.');
  }

  const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });

  // WHY we check the DB row, not just "did the JWT verify": the JWT
  // signature alone can't express "this specific token was revoked" (e.g.
  // via logout, or because it was already rotated once). The DB row is
  // the actual source of truth for "is this refresh token still usable" -
  // the JWT signature only proves "this token was legitimately issued by
  // us at some point," not "it's still valid right now."
  if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.tokenHash !== hashToken(rawRefreshToken)) {
    throw new UnauthorizedError('Refresh token is no longer valid.');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw new UnauthorizedError('User no longer exists.');
  }

  // Rotation: revoke the token just used, issue a brand new one. This
  // means if a refresh token is ever stolen AND used by an attacker, the
  // legitimate user's next refresh attempt will fail (their old token is
  // already revoked) - a detectable signal of compromise, not silent
  // indefinite reuse of the same long-lived token.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const tokens = await issueTokenPair(user.id, user.role);

  return { user: { id: user.id, email: user.email, role: user.role }, ...tokens };
}

export async function logout(rawRefreshToken: string | undefined): Promise<void> {
  if (!rawRefreshToken) return; // nothing to revoke - treat logout as a no-op success

  try {
    const payload = verifyRefreshToken(rawRefreshToken);
    await prisma.refreshToken.updateMany({
      where: { id: payload.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    // An already-invalid/expired token on logout isn't an error worth
    // surfacing - the end state the user wants (being logged out) is
    // achieved either way once the controller clears the cookie.
  }
}
