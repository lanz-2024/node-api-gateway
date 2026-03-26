/**
 * Error handler middleware — RFC 7807 Problem Details.
 *
 * Catches all errors propagated through the middleware chain and normalises
 * them into a consistent JSON response shape so clients never receive raw
 * stack traces or unstructured error messages.
 *
 * Spec: https://www.rfc-editor.org/rfc/rfc7807
 */

import type { Context } from 'hono';
import type { ProblemDetails } from '../types/index.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly title: string,
    message?: string,
  ) {
    super(message ?? title);
    this.name = 'HttpError';
  }
}

export class NotFoundError extends HttpError {
  constructor(detail?: string) {
    super(404, 'Not Found', detail);
  }
}

export class ValidationError extends HttpError {
  constructor(detail?: string) {
    super(422, 'Unprocessable Entity', detail);
  }
}

export class ServiceUnavailableError extends HttpError {
  constructor(detail?: string) {
    super(503, 'Service Unavailable', detail);
  }
}

// Hono calls this function on unhandled errors in route handlers.
export function errorHandler(err: Error, c: Context): Response {
  const traceId = c.get('requestId') as string | undefined;
  const instance = c.req.path;

  if (err instanceof HttpError) {
    const problem: ProblemDetails = {
      type: `https://httpstatuses.io/${err.status}`,
      title: err.title,
      status: err.status,
      detail: err.message !== err.title ? err.message : undefined,
      instance,
      traceId,
    };
    return c.json(problem, err.status as 400);
  }

  // Circuit breaker open — surface as 503
  if (err.message.includes('Circuit breaker') && err.message.includes('OPEN')) {
    const problem: ProblemDetails = {
      type: 'https://httpstatuses.io/503',
      title: 'Service Unavailable',
      status: 503,
      detail: 'Upstream service is temporarily unavailable. Please retry shortly.',
      instance,
      traceId,
    };
    return c.json(problem, 503);
  }

  // Unexpected error — don't leak internals
  if (process.env['NODE_ENV'] !== 'production') {
    console.debug('[error-handler]', err);
  }

  const problem: ProblemDetails = {
    type: 'https://httpstatuses.io/500',
    title: 'Internal Server Error',
    status: 500,
    detail: process.env['NODE_ENV'] === 'production' ? undefined : err.message,
    instance,
    traceId,
  };

  return c.json(problem, 500);
}

/** 404 handler for unknown routes. */
export function notFoundHandler(c: Context): Response {
  const traceId = c.get('requestId') as string | undefined;
  const problem: ProblemDetails = {
    type: 'https://httpstatuses.io/404',
    title: 'Not Found',
    status: 404,
    detail: `Route ${c.req.method} ${c.req.path} not found`,
    instance: c.req.path,
    traceId,
  };
  return c.json(problem, 404);
}
