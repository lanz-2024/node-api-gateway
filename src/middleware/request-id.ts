/**
 * Request ID middleware.
 *
 * Propagates or generates an X-Request-ID correlation header.
 * Downstream services and log lines include this ID for distributed tracing.
 */

import type { Context, Next } from 'hono';
import { randomUUID } from 'node:crypto';

export async function requestId(c: Context, next: Next): Promise<void> {
  const existing = c.req.header('x-request-id');
  const id = existing ?? randomUUID();

  c.set('requestId', id);
  c.header('X-Request-ID', id);

  await next();
}
