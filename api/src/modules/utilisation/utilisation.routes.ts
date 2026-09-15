// src/modules/utilisation/utilisation.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/requireAdmin.js';
import { validate } from '../../middleware/validate.js';
import { getUtilisationHandler } from './utilisation.controller.js';

const UtilisationQuerySchema = z
  .object({
    rangeStart: z.coerce.date(),
    rangeEnd: z.coerce.date(),
  })
  .refine((data) => data.rangeEnd > data.rangeStart, {
    message: 'rangeEnd must be after rangeStart.',
    path: ['rangeEnd'],
  });

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
