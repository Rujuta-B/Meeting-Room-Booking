// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL's own auto-cleanup relies on detecting global test-framework hooks
// (afterEach/afterAll on globalThis) - since this project deliberately runs
// with `globals: false` (explicit describe/it/expect imports, matching the
// backend's api/tests/*.test.ts style), that detection doesn't fire, so
// cleanup must be registered explicitly here instead.
afterEach(() => {
  cleanup();
});
