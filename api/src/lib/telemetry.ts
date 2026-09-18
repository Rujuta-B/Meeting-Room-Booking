// src/lib/telemetry.ts
//
// WHY this must be initialized before app.js/env.js are imported: the
// `applicationinsights` SDK instruments Node's http/https modules and other
// core APIs by monkey-patching them at `.start()` time - any module already
// imported (and thus already holding a reference to the unpatched http
// module) before `.start()` runs won't be auto-instrumented. server.ts
// calls this first, before importing app.js, for the same reason it awaits
// config/secrets.ts's loadSecretsIntoEnv() first - both need to run before
// the rest of the app's module graph loads.
//
// Fully inert without APPLICATIONINSIGHTS_CONNECTION_STRING set - local
// Docker Compose dev never sets it, so this is a no-op there.
import appInsights from 'applicationinsights';
import { Writable } from 'node:stream';

export function startTelemetry(): void {
  if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) return;

  appInsights
    .setup() // reads APPLICATIONINSIGHTS_CONNECTION_STRING from process.env itself
    // Auto-collects incoming HTTP requests, outgoing dependency calls (the
    // Postgres queries Prisma makes), and uncaught exceptions - this is
    // what populates App Insights' Requests/Dependencies/Failures blades
    // without hand-instrumenting every route. (v3's SDK always correlates
    // dependencies to their parent request - the v2-era
    // setAutoDependencyCorrelation toggle no longer exists.)
    .setAutoCollectRequests(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectExceptions(true)
    .setSendLiveMetrics(false)
    .start();
}

// WHY pipe pino logs into App Insights too, rather than treating logging
// and telemetry as separate concerns: startTelemetry()'s auto-collection
// only sees HTTP requests/dependencies/exceptions - it has no idea a
// booking was created, cancelled, or rejected for a double-booking,
// because those are hand-written pino business-event logs (see
// bookings.controller.ts), not HTTP-level facts. This returns a pino
// destination stream that forwards every log line as an App Insights
// trace, at a severity derived from pino's own numeric level - the SAME
// structured events that land in stdout locally also show up in App
// Insights' Logs blade in production, searchable by the same
// requestId/correlationId/outcome fields already on every line, rather
// than needing a second, hand-maintained set of telemetry calls.
//
// This is pino's own documented extension point (a Writable passed as the
// logger's second constructor argument) - not a private/internal API.
export function createTelemetryStream(): Writable | undefined {
  if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) return undefined;

  const client = appInsights.defaultClient;

  return new Writable({
    write(chunk: Buffer, _encoding: string, callback: () => void) {
      try {
        const line = JSON.parse(chunk.toString()) as Record<string, unknown> & { level: number; msg?: string };
        client.trackTrace({
          message: line.msg ?? 'log',
          severity: pinoLevelToSeverity(line.level),
          properties: line as unknown as Record<string, string>,
        });
      } catch {
        // A malformed line should never crash logging itself - App
        // Insights forwarding is a secondary destination, not the source
        // of truth (stdout/pino remains that).
      }
      callback();
    },
  });
}

// pino's numeric levels (10=trace ... 60=fatal) mapped to App Insights'
// KnownSeverityLevel strings - the two scales don't line up 1:1, so this
// buckets pino's finer-grained levels into AI's coarser ones.
function pinoLevelToSeverity(level: number): string {
  if (level >= 60) return 'Critical'; // fatal
  if (level >= 50) return 'Error';
  if (level >= 40) return 'Warning';
  if (level >= 30) return 'Information'; // info
  return 'Verbose'; // debug/trace
}
