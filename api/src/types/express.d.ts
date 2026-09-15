// src/types/express.d.ts
//
// WHY this file exists: Express's own Request type doesn't know about the
// fields OUR middleware attaches to it (req.user from authenticate.ts,
// req.log from requestId.ts). Without this "declaration merging", every
// controller reading req.user would need a TypeScript cast or `any`.
// Declaration merging lets us extend Express's own interface once, here,
// and get real autocomplete + type-checking on req.user/req.log everywhere
// else in the app - this is a TypeScript feature, not an Express one.
import type { Logger } from 'pino';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: 'USER' | 'ADMIN';
      };
      id: string;
      log: Logger;
    }
  }
}

export {};
