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

// WHY correlation id is separate from request id: requestId is always
// generated fresh, per-hop, by THIS server - it identifies one request to
// THIS API and nothing upstream of it. correlationId is meant to survive
// across service hops: if this API is ever called by another service (or
// chained through a gateway) that already assigned an id to the overall
// operation, honoring an inbound X-Correlation-Id lets every hop's logs be
// grepped together under one value, while requestId still uniquely
// identifies this specific hop's own request/response pair. When nothing
// upstream provided one, the correlation id simply defaults to this
// request's own id - there is still always a single value to filter logs
// by, whether or not a caller participates in the convention.
const CORRELATION_ID_HEADER = 'x-correlation-id';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.id = randomUUID();

  const inboundCorrelationId = req.header(CORRELATION_ID_HEADER);
  req.correlationId = inboundCorrelationId && inboundCorrelationId.length > 0 ? inboundCorrelationId : req.id;

  // A pino "child" logger inherits the parent's config but has this
  // request's id baked into every line it emits, so callers never have to
  // remember to pass requestId manually on every log call.
  req.log = logger.child({ requestId: req.id, correlationId: req.correlationId });
  res.setHeader('X-Request-Id', req.id);
  res.setHeader('X-Correlation-Id', req.correlationId);
  next();
}
