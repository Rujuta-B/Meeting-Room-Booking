// src/server.ts
//
// The ONLY job of this file: build the app and bind it to a port. Kept
// separate from app.ts so tests can import buildApp() without ever
// opening a real network socket - see app.ts's top comment for the full
// reasoning.
import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

const app = buildApp();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Booking API listening');
});
