// src/modules/utilisation/utilisation.controller.ts
import type { Request, Response } from 'express';
import * as utilisationService from './utilisation.service.js';
import { buildPaginationMeta } from '../rooms/rooms.schemas.js';
import type { UtilisationQueryInput, RoomDayTimelineQueryInput } from './utilisation.routes.js';

export async function getUtilisationHandler(req: Request, res: Response): Promise<void> {
  // Query params already validated + coerced to Dates by validate() +
  // UtilisationQuerySchema (see utilisation.routes.ts) before this runs.
  const query = req.query as unknown as UtilisationQueryInput;
  const { roomId, ...rest } = query;
  const { report, total } = await utilisationService.getUtilisationReport({
    ...rest,
    ...(roomId !== undefined ? { roomId } : {}),
  });
  res.json({ report, pagination: buildPaginationMeta(query, total) });
}

export async function getRoomDayTimelineHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as unknown as RoomDayTimelineQueryInput;
  const slots = await utilisationService.getRoomDayTimeline(query.roomId, query.date);
  res.json({ slots });
}
