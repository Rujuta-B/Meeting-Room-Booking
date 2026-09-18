// tests/setup.ts
//
// Vitest's "globalSetup" - runs ONCE before any test file, in a separate
// process. Its only job: make sure the TEST database exists and is fully
// migrated (including the exclusion constraint) before any test tries to
// use it. Deliberately does NOT truncate tables here - that happens
// per-test in tests/helpers/factories.ts, since globalSetup runs once for
// the whole run, not once per file.
//
// WHY tests need a REAL Postgres database at all, not a mock: the entire
// guarantee under test (the EXCLUDE constraint) lives inside Postgres
// itself. Mocking Prisma/the DB layer would only prove "our mock behaves
// the way we told it to" - it would prove nothing about whether the actual
// constraint works. See bookings.concurrency.test.ts for the sharpest
// example of why this matters.
import { execSync } from 'node:child_process';

// eslint-disable-next-line @typescript-eslint/require-await -- Vitest's globalSetup contract expects `() => void | Promise<void>`; this uses execSync (synchronous) on purpose, not a missed await.
export async function setup(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Tests need a running Postgres test database - ' +
        'see api/.env.test.example and the README for how to point tests at one.',
    );
  }

  // `prisma migrate deploy` applies every migration (including the
  // hand-written exclusion-constraint one) in order, idempotently - safe
  // to run every time the test suite starts, even if the test DB is
  // already fully migrated from a previous run.
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
}
