// src/app.ts
//
// WHY app.ts and server.ts are SEPARATE files: buildApp() returns a fully
// configured Express app WITHOUT calling .listen(). That's what lets the
// test suite (tests/helpers/testApp.ts) import buildApp() and drive it
// in-process with supertest, on an ephemeral port, with no real network
// hop - including the concurrency test firing two truly-simultaneous
// requests at it. server.ts is the only file that actually binds a port,
// and it's never imported by tests.
import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { requestId } from './middleware/requestId.js';
import { accessLog } from './middleware/accessLog.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { roomRoutes } from './modules/rooms/rooms.routes.js';
import { bookingRoutes } from './modules/bookings/bookings.routes.js';
import { utilisationRoutes } from './modules/utilisation/utilisation.routes.js';

export function buildApp(): Express {
  const app = express();

  // Assigns req.id/req.log FIRST, before anything else, so every
  // subsequent middleware and route handler can log with request context.
  app.use(requestId);
  // Registered right after requestId so every request - including ones
  // that fail validation or auth before reaching a route handler - gets
  // exactly one access-log line with the requestId/correlationId already
  // attached via req.log.
  app.use(accessLog);

  app.use(
    cors({
      // An EXACT origin, never '*'. Browsers refuse to expose a
      // credentialed response (one made with `credentials: 'include'`,
      // which the frontend uses for every request so the httpOnly refresh
      // cookie can travel) to frontend JS if Access-Control-Allow-Origin
      // is a wildcard while Access-Control-Allow-Credentials is true - the
      // CORS spec explicitly forbids that combination. So the allowed
      // origin has to be a real, specific value from config.
      origin: env.WEB_ORIGIN,
      credentials: true,
    }),
  );

  // Parses the httpOnly refresh-token cookie off incoming requests into
  // req.cookies - only the /auth/refresh and /auth/logout routes actually
  // read it (the cookie itself is scoped to Path=/auth/refresh so browsers
  // won't even send it elsewhere), but the parser has to run globally
  // before any route can access req.cookies at all.
  app.use(cookieParser());

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/auth', authRoutes);
  app.use('/rooms', roomRoutes);
  app.use('/bookings', bookingRoutes);
  app.use('/utilisation', utilisationRoutes);

  // Registered LAST, after every route: Express recognizes an error
  // middleware specifically by its 4-argument signature (err, req, res,
  // next) and routes any thrown/rejected error here from anywhere upstream
  // - see errorHandler.ts for why this is the one place errors become
  // HTTP responses.
  app.use(errorHandler);

  return app;
}
