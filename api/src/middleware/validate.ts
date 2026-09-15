// src/middleware/validate.ts
//
// WHY a generic validate() FACTORY instead of calling schema.parse()
// inside each controller: the spec requires bad input to be "rejected
// before it reaches your business logic" - a controller that validates
// itself, in the middle of its own logic, makes that boundary fuzzy and
// easy to skip by accident on a new route. A middleware factory that runs
// BEFORE the controller, wired at the router level
// (router.post('/', validate(CreateBookingSchema), controller.create)),
// makes "validated before business logic" a structural guarantee, visible
// directly in the route definition, not something you have to trust every
// controller author remembered to do.
import type { NextFunction, Request, Response } from 'express';
import type { ZodError, ZodSchema } from 'zod';
import { ValidationError } from '../lib/errors.js';

// Which part of the request to validate against a schema - most routes
// validate the body, but search/utilisation endpoints validate query
// params instead.
type ValidationTarget = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      throw new ValidationError(formatZodError(result.error));
    }

    // Replace the raw input with the PARSED result (not just validated) -
    // zod can coerce/transform (e.g. a query string "5" -> number 5), so
    // downstream code should read the parsed value, not the original
    // req.body/req.query, to get the types it was actually validated as.
    (req as unknown as Record<ValidationTarget, unknown>)[target] = result.data;
    next();
  };
}

function formatZodError(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}
