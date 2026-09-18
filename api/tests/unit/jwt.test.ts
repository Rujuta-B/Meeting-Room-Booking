// tests/unit/jwt.test.ts
//
// Pure unit tests for src/lib/jwt.ts - no database, no HTTP, no
// createTestApp()/resetDatabase(). This module reads env.JWT_ACCESS_SECRET
// / env.JWT_REFRESH_SECRET (via src/config/env.ts) at import time, same as
// every other module in the app - vitest.config.ts loads api/.env.test via
// loadDotenv() before any test file runs, so process.env is already
// populated by the time this file's imports execute. No special setup is
// needed here beyond what every other test file already relies on.
import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } from '../../src/lib/jwt.js';

describe('access token sign/verify round-trip', () => {
  it('verifyAccessToken returns the same {sub, role} payload that was signed', () => {
    const token = signAccessToken({ sub: 'user-123', role: 'ADMIN' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe('user-123');
    expect(payload.role).toBe('ADMIN');
  });

  it('verifyAccessToken throws on a garbage string', () => {
    expect(() => verifyAccessToken('not-a-real-token')).toThrow();
  });

  it('verifyAccessToken throws on a token signed with a different/wrong secret', () => {
    const bogusToken = jwt.sign({ sub: 'user-123', role: 'USER' }, 'totally-wrong-secret-value', { expiresIn: '15m' });
    expect(() => verifyAccessToken(bogusToken)).toThrow();
  });
});

describe('refresh token sign/verify round-trip', () => {
  it('verifyRefreshToken returns the same {sub, jti} payload that was signed', () => {
    const token = signRefreshToken({ sub: 'user-456', jti: 'jti-abc' });
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe('user-456');
    expect(payload.jti).toBe('jti-abc');
  });

  it('verifyRefreshToken throws on a garbage string', () => {
    expect(() => verifyRefreshToken('not-a-real-token')).toThrow();
  });

  it('verifyRefreshToken throws on a token signed with a different/wrong secret', () => {
    const bogusToken = jwt.sign({ sub: 'user-456', jti: 'jti-abc' }, 'another-wrong-secret', { expiresIn: '7d' });
    expect(() => verifyRefreshToken(bogusToken)).toThrow();
  });
});
