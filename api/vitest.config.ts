// vitest.config.ts
//
// WHY fileParallelism is OFF: most of these test files share and mutate
// the same real Postgres test database (truncating tables between tests -
// see tests/setup.ts). Running test FILES in parallel would mean two
// files' truncate/insert calls racing against each other, corrupting each
// other's fixtures. Turning this off makes files run one at a time -
// slower, but deterministic. This does NOT affect the concurrency test
// itself (bookings.concurrency.test.ts): that test's parallelism is
// Promise.all() of two requests INSIDE one test function, which is
// unaffected by whether test FILES run in parallel.
import { defineConfig } from 'vitest/config';
import { config as loadDotenv } from 'dotenv';

// Plain vitest.config.ts (a Node tool, not the Vite dev server) does NOT
// auto-load .env files the way Vite does for frontend builds - that's a
// Vite convention, not something Vitest inherits for granted. We load
// api/.env.test explicitly, BEFORE defineConfig runs, so env.ts (which
// reads process.env at import time, inside the test run) sees a real
// DATABASE_URL/JWT secrets/etc pointed at the TEST database, never dev.
loadDotenv({ path: '.env.test' });

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/setup.ts',
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
