// src/modules/utilisation/utilisation.controller.ts
import type { Request, Response } from 'express';
import * as utilisationService from './utilisation.service.js';

export async function getUtilisationHandler(req: Request, res: Response): Promise<void> {
  // Query params already validated + coerced to Dates by validate() +
  // UtilisationQuerySchema (see utilisation.routes.ts) before this runs.
  const { rangeStart, rangeEnd } = req.query as unknown as { rangeStart: Date; rangeEnd: Date };
  const report = await utilisationService.getUtilisationReport(rangeStart, rangeEnd);
  res.json({ report });
}
