/**
 * Authentication middleware.
 *
 * Supports two schemes:
 *   1. Bearer JWT  — Authorization: Bearer <token>
 *   2. API Key     — X-API-Key: <key>  (for machine-to-machine)
 *
 * On success, sets the `auth` variable on the Hono context.
 * On failure, returns 401 with RFC 7807 Problem Details.
 */

import type { Context, Next } from 'hono';
import { type JWTPayload as JoseJWTPayload, jwtVerify } from 'jose';
import type { AuthContext } from '../types/index.js';

export interface AuthMiddlewareOptions {
  jwtSecret: string;
  /** Static API keys — map of key → roles. For demo/testing. */
  apiKeys?: Record<string, string[]>;
}

// Extend Hono's context variable map
declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext;
    requestId: string;
  }
}

export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const secretBytes = new TextEncoder().encode(options.jwtSecret);
  const apiKeys = options.apiKeys ?? {};

  return async (c: Context, next: Next): Promise<Response | undefined> => {
    const authorization = c.req.header('authorization');
    const apiKey = c.req.header('x-api-key');

    // ── JWT Bearer ────────────────────────────────────────────────────────────
    if (authorization?.startsWith('Bearer ')) {
      const token = authorization.slice(7);

      try {
        const { payload } = await jwtVerify(token, secretBytes, {
          algorithms: ['HS256'],
        });

        const jwtPayload = payload as JoseJWTPayload & {
          email?: string;
          roles?: string[];
        };

        c.set('auth', {
          userId: jwtPayload.sub ?? '',
          email: jwtPayload.email ?? '',
          roles: jwtPayload.roles ?? [],
          authMethod: 'jwt',
        });

        await next();
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid token';
        return c.json(
          {
            type: 'https://httpstatuses.io/401',
            title: 'Unauthorized',
            status: 401,
            detail: msg,
            instance: c.req.path,
            traceId: c.get('requestId'),
          },
          401
        );
      }
    }

    // ── API Key ───────────────────────────────────────────────────────────────
    if (apiKey) {
      const roles = apiKeys[apiKey];
      if (roles) {
        c.set('auth', {
          userId: `api-key:${apiKey.slice(0, 8)}`,
          email: '',
          roles,
          authMethod: 'api_key',
        });
        await next();
        return;
      }

      return c.json(
        {
          type: 'https://httpstatuses.io/401',
          title: 'Unauthorized',
          status: 401,
          detail: 'Invalid API key',
          instance: c.req.path,
          traceId: c.get('requestId'),
        },
        401
      );
    }

    // ── No credentials ────────────────────────────────────────────────────────
    return c.json(
      {
        type: 'https://httpstatuses.io/401',
        title: 'Unauthorized',
        status: 401,
        detail: 'Missing Authorization header or X-API-Key',
        instance: c.req.path,
        traceId: c.get('requestId'),
      },
      401
    );
  };
}

/** Require a specific role. Must be used after createAuthMiddleware. */
export function requireRole(role: string) {
  return async (c: Context, next: Next): Promise<Response | undefined> => {
    const auth = c.get('auth');
    if (!auth?.roles.includes(role)) {
      return c.json(
        {
          type: 'https://httpstatuses.io/403',
          title: 'Forbidden',
          status: 403,
          detail: `Role '${role}' required`,
          instance: c.req.path,
          traceId: c.get('requestId'),
        },
        403
      );
    }
    await next();
    return;
  };
}
