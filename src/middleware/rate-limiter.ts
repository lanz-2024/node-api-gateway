/**
 * Rate limiter middleware — token bucket algorithm.
 *
 * Each client (identified by X-Forwarded-For or remote IP) gets a bucket of
 * `requestsPerWindow` tokens. Tokens refill continuously based on elapsed
 * time so bursts are handled gracefully without hard window resets.
 *
 * State is stored in CacheService (Redis in production, in-memory in tests).
 */

import type { Context, Next } from 'hono';
import type { CacheService } from '../services/cache.service.js';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export function createRateLimiter(
  cache: CacheService,
  requestsPerWindow: number,
  windowMs: number
) {
  return async (c: Context, next: Next): Promise<Response | undefined> => {
    const clientIp =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
      c.req.header('x-real-ip') ??
      'unknown';

    // Optionally scope rate limit per authenticated user
    const auth = c.get('auth');
    const key = auth ? `rl:user:${auth.userId}` : `rl:ip:${clientIp}`;

    const now = Date.now();
    const raw = await cache.get<TokenBucket>(key);
    const bucket: TokenBucket = raw ?? { tokens: requestsPerWindow, lastRefill: now };

    // Continuous token refill proportional to elapsed time
    const elapsed = now - bucket.lastRefill;
    const refillAmount = (elapsed / windowMs) * requestsPerWindow;
    bucket.tokens = Math.min(requestsPerWindow, bucket.tokens + refillAmount);
    bucket.lastRefill = now;

    const remaining = Math.floor(bucket.tokens - 1);

    if (bucket.tokens < 1) {
      const retryAfterSec = Math.ceil((1 - bucket.tokens) / (requestsPerWindow / windowMs) / 1000);
      c.header('Retry-After', String(retryAfterSec));
      c.header('X-RateLimit-Limit', String(requestsPerWindow));
      c.header('X-RateLimit-Remaining', '0');

      return c.json(
        {
          type: 'https://httpstatuses.io/429',
          title: 'Too Many Requests',
          status: 429,
          detail: `Rate limit exceeded. Try again in ${retryAfterSec}s.`,
          instance: c.req.path,
          traceId: c.get('requestId'),
        },
        429
      );
    }

    bucket.tokens -= 1;
    await cache.set(key, bucket, Math.ceil(windowMs / 1000));

    c.header('X-RateLimit-Limit', String(requestsPerWindow));
    c.header('X-RateLimit-Remaining', String(remaining));

    return next();
  };
}
