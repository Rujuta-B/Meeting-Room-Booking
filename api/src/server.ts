// src/server.ts
//
// The ONLY job of this file: build the app and bind it to a port. Kept
// separate from app.ts so tests can import buildApp() without ever
// opening a real network socket - see app.ts's top comment for the full
// reasoning.
//
// WHY loadSecretsIntoEnv() and startTelemetry() are called here, and
// AWAITED before the dynamic import() of everything else: both need to run
// before config/env.ts (which parses process.env exactly once, at ITS OWN
// module-load time) and the Application Insights SDK (which instruments
// Node's http module at `.start()` time) are first touched. A normal
// top-level `import { buildApp } from './app.js'` is hoisted and resolved
// before any of this file's own code runs, which would load config/env.ts
// - and therefore lock in process.env - too early. The dynamic import()
// below is what lets this file guarantee "secrets and telemetry are fully
// set up first," at the cost of losing static import analysis for just
// this one entrypoint file (never imported by tests - see app.ts).
import { loadSecretsIntoEnv } from './config/secrets.js';
import { startTelemetry } from './lib/telemetry.js';

await loadSecretsIntoEnv();
startTelemetry();

const { buildApp } = await import('./app.js');
const { env } = await import('./config/env.js');
const { logger } = await import('./lib/logger.js');

const app = buildApp();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Booking API listening');
});
