// src/middleware/accessLog.ts
//
// WHY this exists separately from the hand-picked business-event logs in
// each controller (e.g. "Booking created"): those lines tell you WHAT
// happened at the domain level, but not "did every request even get a
// response, and how long did it take" - a request that throws before
// reaching a controller (a validation failure, an auth failure) or one
// that hangs never emits any of those business events at all. This
// middleware logs exactly one line per request, unconditionally, once the
// response has actually finished, so the access log is a complete record
// of every request the server saw regardless of what happened inside it.
//
// WHY a small custom middleware instead of pulling in pino-http: pino-http
// would log using its own top-level logger instance, not the per-request
// child logger requestId.ts already builds - that would mean access-log
// lines and business-event lines for the SAME request stop sharing the
// same requestId/correlationId shape unless pino-http is reconfigured to
// match. Building this by hand keeps every log line in the app going
// through req.log, so the shape is identical everywhere.
import type { NextFunction, Request, Response } from 'express';

export function accessLog(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();

  // 'finish' fires once the response has been fully sent - the earliest
  // point at which we actually know the final statusCode and a real
  // duration, which we can't know any earlier in the middleware chain.
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const fields = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs),
    };

    // 4xx/5xx get 'warn' so a busy access log doesn't bury failed requests
    // among routine 2xx/3xx traffic - mirrors the same info/warn split
    // already used in errorHandler.ts.
    if (res.statusCode >= 400) {
      req.log.warn(fields, 'Request completed');
    } else {
      req.log.info(fields, 'Request completed');
    }
  });

  next();
}
