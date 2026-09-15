// src/modules/rooms/rooms.controller.ts
import type { Request, Response } from 'express';
import * as roomsService from './rooms.service.js';
import type { CreateRoomInput, UpdateRoomInput, SearchAvailabilityInput } from './rooms.schemas.js';

export async function listRoomsHandler(_req: Request, res: Response): Promise<void> {
  const rooms = await roomsService.listRooms();
  res.json({ rooms });
}

export async function createRoomHandler(req: Request<unknown, unknown, CreateRoomInput>, res: Response): Promise<void> {
  const room = await roomsService.createRoom(req.body);
  req.log.info({ roomId: room.id }, 'Room created');
  res.status(201).json({ room });
}

export async function updateRoomHandler(req: Request<{ id: string }, unknown, UpdateRoomInput>, res: Response): Promise<void> {
  const room = await roomsService.updateRoom(req.params.id, req.body);
  req.log.info({ roomId: room.id }, 'Room updated');
  res.json({ room });
}

// WHY req.query is read as `unknown` and cast, rather than typing it into
// the handler's own Request<> generic: Express's own RequestHandler type
// pins req.query to its built-in ParsedQs shape, which the validate()
// middleware's output (SearchAvailabilityInput, with real Date objects and
// a resolved string[]) doesn't structurally match - that's a real,
// deliberate mismatch (zod TRANSFORMS the raw query strings into richer
// types), not a mistake to type around. The cast here is safe specifically
// BECAUSE `validate(SearchAvailabilitySchema, 'query')` already ran first
// in rooms.routes.ts and overwrote req.query with the parsed, coerced
// result - see middleware/validate.ts.
export async function searchAvailabilityHandler(req: Request, res: Response): Promise<void> {
  const rooms = await roomsService.searchAvailableRooms(req.query as unknown as SearchAvailabilityInput);
  res.json({ rooms });
}
