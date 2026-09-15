// src/modules/auth/auth.routes.ts
//
// Routes wire together, in order: validation -> (auth, where needed) ->
// controller. That order matters - see validate.ts's comment on why
// validation must run before anything else touches the request.
import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler.js';
import { validate } from '../../middleware/validate.js';
import { RegisterSchema, LoginSchema } from './auth.schemas.js';
import { registerHandler, loginHandler, refreshHandler, logoutHandler } from './auth.controller.js';

export const authRoutes = Router();

authRoutes.post('/register', validate(RegisterSchema), asyncHandler(registerHandler));
authRoutes.post('/login', validate(LoginSchema), asyncHandler(loginHandler));
// No validate() here - refresh/logout take no body, they read the
// httpOnly cookie directly (see auth.controller.ts).
authRoutes.post('/refresh', asyncHandler(refreshHandler));
authRoutes.post('/logout', asyncHandler(logoutHandler));
