// src/modules/utilisation/utilisation.controller.ts
import type { Request, Response } from 'express';
import * as utilisationService from './utilisation.service.js';
import { buildPaginationMeta } from '../rooms/rooms.schemas.js';
import type { UtilisationQueryInput } from './utilisation.routes.js';

export async function getUtilisationHandler(req: Request, res: Response): Promise<void> {
  // Query params already validated + coerced to Dates by validate() +
  // UtilisationQuerySchema (see utilisation.routes.ts) before this runs.
  const query = req.query as unknown as UtilisationQueryInput;
  const { report, total } = await utilisationService.getUtilisationReport(query);
  res.json({ report, pagination: buildPaginationMeta(query, total) });
}
