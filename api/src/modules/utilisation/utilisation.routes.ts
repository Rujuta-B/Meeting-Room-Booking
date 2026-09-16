// src/modules/utilisation/utilisation.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/requireAdmin.js';
import { validate } from '../../middleware/validate.js';
import { PaginationSchema } from '../rooms/rooms.schemas.js';
import { getUtilisationHandler } from './utilisation.controller.js';

export const UtilisationQuerySchema = z
  .object({
    rangeStart: z.coerce.date(),
    rangeEnd: z.coerce.date(),
    // Scope the report to one room - previously always returned every
    // room in range, with no way to look at a single room's trend.
    roomId: z.string().uuid().optional(),
  })
  .merge(PaginationSchema)
  .refine((data) => data.rangeEnd > data.rangeStart, {
    message: 'rangeEnd must be after rangeStart.',
    path: ['rangeEnd'],
  });
export type UtilisationQueryInput = z.infer<typeof UtilisationQuerySchema>;

// authenticate BEFORE requireAdmin: we must know who the caller is before
// we can check their role - see requireAdmin.ts.
export const utilisationRoutes = Router();
utilisationRoutes.get(
  '/',
  authenticate,
  requireAdmin,
  validate(UtilisationQuerySchema, 'query'),
  asyncHandler(getUtilisationHandler),
);
