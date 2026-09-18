// vite.config.ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: false,
    // Deliberately neither UTC nor IST: catches any date/time code that
    // accidentally relies on the runner's local timezone instead of
    // explicit IST conversion (see src/lib/istTime.ts).
    env: { TZ: 'America/New_York' },
  },
});
