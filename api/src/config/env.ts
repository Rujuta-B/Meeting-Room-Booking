// src/config/env.ts
//
// WHY parse process.env through zod instead of reading it directly
// everywhere: raw process.env values are always `string | undefined` to
// TypeScript, no matter what you know is actually in your .env file. If we
// read process.env.PORT directly in ten different files, a typo in the env
// var name or a missing value fails silently (undefined) at whatever
// random point it's first used - possibly deep into a request. Parsing
// ONCE, here, at startup, means the app crashes immediately and loudly on
// boot if config is missing/malformed, with one clear error message -
// instead of a confusing runtime bug three requests later.
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Two DIFFERENT secrets for access vs refresh tokens - if one leaks or is
  // rotated, the other token type is unaffected. Using the same secret for
  // both would mean a leaked access-token secret also lets an attacker
  // forge refresh tokens.
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  // WHY there is only ONE env var for the refresh token's lifetime, not
  // two: an earlier version of this config had a second variable
  // (JWT_REFRESH_EXPIRES_IN_DAYS) purely so auth.service.ts could compute
  // a real Date for the refresh_tokens table's expiresAt column, since a
  // duration STRING like "7d" isn't directly usable for that. Having two
  // separately-configured values describing the same lifetime is a
  // maintainability footgun - nothing enforces they stay in sync, so
  // changing one without the other would make the signed JWT's own expiry
  // silently disagree with the DB row's revocation-check expiry. Instead,
  // lib/jwt.ts derives the days value FROM this single string at
  // startup (parseDurationToMs), so there is exactly one place this
  // lifetime is configured.
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  // Exact origin the frontend is served from - required for CORS to allow
  // credentialed (cookie-carrying) requests. See src/app.ts for why this
  // can never be '*'.
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),

  // 'silent' is a real pino level (disables logging entirely) - included
  // here because api/.env.test.example ships LOG_LEVEL=silent for quiet
  // test runs; omitting it from this enum would make the documented test
  // config fail startup validation.
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Deliberately console.error + exit rather than throw: this runs before
  // the logger exists, and a thrown error during module load can produce a
  // confusing stack trace pointing at this file instead of the real
  // problem (a missing .env entry).
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
