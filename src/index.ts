/**
 * Entry point.
 *
 * Bootstraps the Hono app and starts the @hono/node-server HTTP adapter.
 * All configuration is read from environment variables via src/config/env.ts.
 */

import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    // pino is not yet available here — a single startup log is acceptable
    process.stdout.write(
      JSON.stringify({
        level: 'info',
        msg: 'Server started',
        port: info.port,
        env: env.NODE_ENV,
        pid: process.pid,
      }) + '\n',
    );
  },
);

// Graceful shutdown
function shutdown(signal: string): void {
  process.stdout.write(
    JSON.stringify({ level: 'info', msg: `Received ${signal}, shutting down` }) + '\n',
  );
  server.close(() => {
    process.stdout.write(JSON.stringify({ level: 'info', msg: 'Server closed' }) + '\n');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
