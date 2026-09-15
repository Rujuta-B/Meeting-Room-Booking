// src/middleware/requestId.ts
//
// WHY a request id at all: when ten requests hit the server at once
// (exactly the scenario the concurrency test exercises), their log lines
// interleave in the output. Without a per-request id, "insert failed" and
// "insert succeeded" lines from two DIFFERENT requests are indistinguishable
// in the logs. Tagging every log line for a request with the same short id
// (and putting that id on a per-request "child logger") lets you grep one
// request's entire lifecycle back out of a busy log stream - this is the
// backend half of the audit trail the spec asks for.
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.js';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.id = randomUUID();
  // A pino "child" logger inherits the parent's config but has this
  // request's id baked into every line it emits, so callers never have to
  // remember to pass requestId manually on every log call.
  req.log = logger.child({ requestId: req.id });
  res.setHeader('X-Request-Id', req.id);
  next();
}
