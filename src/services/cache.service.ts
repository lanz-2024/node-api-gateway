/**
 * Cache service — Strategy pattern.
 *
 * Selects Redis when a Redis instance is injected; falls back to in-memory for
 * local development and tests (zero external dependencies in mock mode).
 */

// ─── Strategy Interface ───────────────────────────────────────────────────────

export interface CacheStrategy {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  ping(): Promise<boolean>;
}

// ─── In-Memory Strategy ──────────────────────────────────────────────────────

interface CacheEntry {
  value: unknown;
  expires: number;
}

export class InMemoryCache implements CacheStrategy {
  private readonly store = new Map<string, CacheEntry>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async ping(): Promise<boolean> {
    return true;
  }

  get size(): number {
    return this.store.size;
  }

  flush(): void {
    this.store.clear();
  }
}

// ─── Redis Strategy ──────────────────────────────────────────────────────────

export interface RedisLike {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  ping(): Promise<string>;
}

export class RedisCache implements CacheStrategy {
  constructor(private readonly redis: RedisLike) {}

  async get<T>(key: string): Promise<T | null> {
    const val = await this.redis.get(key);
    return val ? (JSON.parse(val) as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.redis.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }
}

// ─── Public Service ───────────────────────────────────────────────────────────

export class CacheService {
  readonly type: 'redis' | 'memory';
  private readonly strategy: CacheStrategy;

  constructor(strategy: CacheStrategy, type: 'redis' | 'memory') {
    this.strategy = strategy;
    this.type = type;
  }

  get<T>(key: string): Promise<T | null> {
    return this.strategy.get<T>(key);
  }

  set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    return this.strategy.set(key, value, ttlSeconds);
  }

  del(key: string): Promise<void> {
    return this.strategy.del(key);
  }

  ping(): Promise<boolean> {
    return this.strategy.ping();
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export interface CacheServiceOptions {
  redis?: RedisLike;
}

/**
 * Creates a CacheService backed by Redis if a client is provided,
 * otherwise uses in-memory cache (suitable for tests and mock mode).
 */
export function createCacheService(options: CacheServiceOptions = {}): CacheService {
  if (options.redis) {
    return new CacheService(new RedisCache(options.redis), 'redis');
  }
  return new CacheService(new InMemoryCache(), 'memory');
}

/**
 * Builds a Redis client from a URL and returns a CacheService backed by it.
 * Used in production bootstrap only; not called in tests.
 */
export async function createRedisCacheService(redisUrl: string): Promise<CacheService> {
  const { Redis } = await import('ioredis');
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
  });
  await redis.connect();
  return new CacheService(new RedisCache(redis), 'redis');
}
