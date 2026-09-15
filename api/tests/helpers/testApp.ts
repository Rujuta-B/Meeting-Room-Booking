// tests/helpers/testApp.ts
//
// Just re-exports buildApp() under a test-friendly name. This is the exact
// mechanism that lets supertest drive real HTTP requests against the app
// IN-PROCESS (no separate `npm start`, no real network port) - see
// src/app.ts's top comment for why app.ts/server.ts are split this way.
export { buildApp as createTestApp } from '../../src/app.js';
