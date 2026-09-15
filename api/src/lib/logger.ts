// src/lib/logger.ts
//
// WHY a structured logger (pino) instead of console.log: console.log
// produces free-text lines that are painful to search/filter/aggregate in
// any real deployment. pino produces one JSON object per log line
// (timestamp, level, message, plus whatever extra fields we attach - user
// id, room id, booking id, request id...). That's what turns "a booking
// was cancelled" into actual evidence you can query later: "show me every
// BOOKING_CONFLICT for room X in the last week." This directly serves the
// POC's audit-trail requirement (section 6 of the spec: "a structured
// trace - useful evidence when a user disputes the system let someone
// steal my room").
import pino from 'pino';
import { env, isProduction } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  // In development, pretty-print for human eyes. In production, emit raw
  // JSON lines - that's the format a real log aggregator (Datadog,
  // CloudWatch, etc.) expects, and pretty-printing there would just add
  // formatting overhead nobody reads directly.
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});
