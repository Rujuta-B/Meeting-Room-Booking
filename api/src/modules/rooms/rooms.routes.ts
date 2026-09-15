// src/modules/rooms/rooms.routes.ts
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/requireAdmin.js';
import { validate } from '../../middleware/validate.js';
import { CreateRoomSchema, UpdateRoomSchema, SearchAvailabilitySchema } from './rooms.schemas.js';
import { listRoomsHandler, createRoomHandler, updateRoomHandler, searchAvailabilityHandler } from './rooms.controller.js';

export const roomRoutes = Router();

// Search and listing are readable by any authenticated user (not
// admin-only) - browsing/searching rooms is a normal user action, not an
// administrative one. Still requires auth: there is no anonymous path
// anywhere in this API, per the spec.
roomRoutes.get('/', authenticate, asyncHandler(listRoomsHandler));
roomRoutes.get('/search', authenticate, validate(SearchAvailabilitySchema, 'query'), asyncHandler(searchAvailabilityHandler));

// Room management (create/update) IS admin-only - authenticate first (who
// are you), then requireAdmin (are you allowed to do this) - see
// requireAdmin.ts for why these stay two separate, composed middlewares.
roomRoutes.post('/', authenticate, requireAdmin, validate(CreateRoomSchema), asyncHandler(createRoomHandler));
roomRoutes.patch('/:id', authenticate, requireAdmin, validate(UpdateRoomSchema), asyncHandler(updateRoomHandler));
