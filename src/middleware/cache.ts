/**
 * Cache-aside middleware with stale-while-revalidate semantics.
 *
 * Serve from cache → on miss, fetch from origin → store result.
 * With SWR: a stale entry is served immediately while the cache is
 * refreshed in the background, eliminating latency spikes on expiry.
 */

import type { Context, Next } from 'hono';
import type { CacheService } from '../services/cache.service.js';

export interface CacheMiddlewareOptions {
  ttlSeconds: number;
  /** Extra seconds beyond TTL where stale data is acceptable. Default: ttlSeconds. */
  swrSeconds?: number;
  /** Skip caching for these HTTP methods. Default: non-GET requests. */
  skipMethods?: string[];
  /** Custom cache key generator. Default: uses request path + query string. */
  keyFn?: (c: Context) => string;
}

interface CachedResponse {
  body: unknown;
  status: number;
  headers: Record<string, string>;
  cachedAt: number;
  ttl: number;
}

export function createCacheMiddleware(cache: CacheService, options: CacheMiddlewareOptions) {
  const {
    ttlSeconds,
    swrSeconds = ttlSeconds,
    skipMethods = ['POST', 'PUT', 'PATCH', 'DELETE'],
    keyFn,
  } = options;

  return async (c: Context, next: Next): Promise<Response | void> => {
    const method = c.req.method.toUpperCase();

    // Only cache idempotent requests
    if (skipMethods.includes(method)) {
      return next();
    }

    const cacheKey = keyFn
      ? keyFn(c)
      : `cache:${c.req.path}?${new URL(c.req.url).searchParams.toString()}`;

    const cached = await cache.get<CachedResponse>(cacheKey);
    const now = Date.now();

    if (cached) {
      const ageSeconds = (now - cached.cachedAt) / 1000;
      const isFresh = ageSeconds < cached.ttl;
      const isStaleButUsable = ageSeconds < cached.ttl + swrSeconds;

      if (isFresh) {
        c.header('X-Cache', 'HIT');
        c.header('Age', String(Math.floor(ageSeconds)));
        return c.json(cached.body, cached.status as 200);
      }

      if (isStaleButUsable) {
        // Serve stale immediately, refresh in background
        c.header('X-Cache', 'STALE');
        c.header('Age', String(Math.floor(ageSeconds)));

        // Background revalidation — do not await
        void revalidate(c, next, cache, cacheKey, ttlSeconds);

        return c.json(cached.body, cached.status as 200);
      }
    }

    c.header('X-Cache', 'MISS');

    // Capture the response so we can cache it
    await next();

    // Only cache successful responses
    if (c.res.status >= 200 && c.res.status < 300) {
      const cloned = c.res.clone();
      const body = await cloned.json().catch(() => null);

      if (body !== null) {
        const entry: CachedResponse = {
          body,
          status: c.res.status,
          headers: {},
          cachedAt: now,
          ttl: ttlSeconds,
        };
        await cache.set(cacheKey, entry, ttlSeconds + swrSeconds);
      }
    }
  };
}

async function revalidate(
  c: Context,
  next: Next,
  cache: CacheService,
  key: string,
  ttlSeconds: number,
): Promise<void> {
  try {
    await next();
    if (c.res.status >= 200 && c.res.status < 300) {
      const cloned = c.res.clone();
      const body = await cloned.json().catch(() => null);
      if (body !== null) {
        const entry: CachedResponse = {
          body,
          status: c.res.status,
          headers: {},
          cachedAt: Date.now(),
          ttl: ttlSeconds,
        };
        await cache.set(key, entry, ttlSeconds * 2);
      }
    }
  } catch {
    // Background revalidation failures are silent — stale data continues to be served
  }
}
