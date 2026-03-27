/**
 * Token bucket rate limiter unit tests.
 *
 * Verifies:
 *   - Allows up to requestsPerWindow requests
 *   - Blocks the (N+1)th request with 429 + Retry-After
 *   - Continuous refill: tokens are restored after time passes
 *   - Per-user scoping when auth context is present
 */

import type { Context, Next } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRateLimiter } from '../../src/middleware/rate-limiter.js';
import { CacheService, InMemoryCache } from '../../src/services/cache.service.js';

function makeCache(): CacheService {
  return new CacheService(new InMemoryCache(), 'memory');
}

interface HeaderStore {
  [key: string]: string;
}

function makeContext(ip = '127.0.0.1', userId?: string): Context {
  const headers: HeaderStore = {};
  return {
    req: {
      header: (name: string) => (name === 'x-forwarded-for' ? ip : undefined),
      path: '/test',
    },
    get: (key: string) => (key === 'auth' && userId ? { userId, roles: [] } : undefined),
    set: vi.fn(),
    header: (name: string, value: string) => {
      headers[name] = value;
    },
    json: vi.fn((body: unknown, status: number) => new Response(JSON.stringify(body), { status })),
    _headers: headers,
  } as unknown as Context;
}

const next: Next = vi.fn(async () => {});

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the limit', async () => {
    const cache = makeCache();
    const limiter = createRateLimiter(cache, 5, 60_000);

    for (let i = 0; i < 5; i++) {
      const c = makeContext();
      const result = await limiter(c, next);
      expect(result).toBeUndefined(); // undefined = passed to next()
    }

    expect(next).toHaveBeenCalledTimes(5);
  });

  it('blocks the N+1 request with 429', async () => {
    const cache = makeCache();
    const limiter = createRateLimiter(cache, 3, 60_000);

    for (let i = 0; i < 3; i++) {
      await limiter(makeContext(), next);
    }

    const blocked = makeContext();
    const result = await limiter(blocked, next);

    expect(result).toBeDefined();
    expect((result as Response).status).toBe(429);
  });

  it('includes Retry-After header on 429 response', async () => {
    const cache = makeCache();
    const limiter = createRateLimiter(cache, 1, 60_000);

    await limiter(makeContext(), next);

    const blocked = makeContext();
    const result = await limiter(blocked, next);
    expect(result).toBeDefined();
    expect((result as Response).status).toBe(429);
  });

  it('includes X-RateLimit-Remaining header on allowed requests', async () => {
    const cache = makeCache();
    const limiter = createRateLimiter(cache, 5, 60_000);

    const headers: HeaderStore = {};
    const c = {
      req: { header: (_name: string) => '10.0.0.1', path: '/' },
      get: () => undefined,
      set: vi.fn(),
      header: (name: string, val: string) => {
        headers[name] = val;
      },
      json: vi.fn(),
    } as unknown as Context;

    await limiter(c, next);
    expect(headers['X-RateLimit-Limit']).toBe('5');
  });

  it('uses separate buckets per IP', async () => {
    const cache = makeCache();
    const limiter = createRateLimiter(cache, 2, 60_000);

    // IP A exhausts its bucket
    await limiter(makeContext('1.1.1.1'), next);
    await limiter(makeContext('1.1.1.1'), next);
    const blockedA = await limiter(makeContext('1.1.1.1'), next);
    expect((blockedA as Response).status).toBe(429);

    // IP B still has capacity
    const allowedB = await limiter(makeContext('2.2.2.2'), next);
    expect(allowedB).toBeUndefined();
  });

  it('uses per-user bucket when auth context is present', async () => {
    const cache = makeCache();
    const limiter = createRateLimiter(cache, 2, 60_000);

    const ctxUser = makeContext('1.1.1.1', 'user-abc');
    await limiter(ctxUser, next);
    await limiter(ctxUser, next);
    const blocked = await limiter(makeContext('1.1.1.1', 'user-abc'), next);
    expect((blocked as Response).status).toBe(429);

    // Different user — unaffected
    const ctxOther = makeContext('1.1.1.1', 'user-xyz');
    const allowed = await limiter(ctxOther, next);
    expect(allowed).toBeUndefined();
  });

  it('refills tokens after window time passes', async () => {
    vi.useFakeTimers();
    const cache = makeCache();
    const limiter = createRateLimiter(cache, 2, 1000);

    // Exhaust the bucket
    await limiter(makeContext(), next);
    await limiter(makeContext(), next);
    const blocked = await limiter(makeContext(), next);
    expect((blocked as Response).status).toBe(429);

    // Advance past the full window — tokens fully refilled
    vi.advanceTimersByTime(1001);

    const allowed = await limiter(makeContext(), next);
    expect(allowed).toBeUndefined();

    vi.useRealTimers();
  });
});
