// src/prisma/client.ts
//
// WHY a single shared PrismaClient instance (a singleton) instead of `new
// PrismaClient()` wherever it's needed: each PrismaClient instance opens
// and manages its own connection pool to Postgres. Creating a new one per
// request/module would exhaust Postgres's max_connections very quickly and
// is a well-known footgun. One instance, created once at module load and
// imported everywhere else, means one pool for the whole app's lifetime.
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

export const prisma = new PrismaClient({
  // Prisma's own query logging - handy in development, noisy in
  // production, and we already have pino for our own structured logs.
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
