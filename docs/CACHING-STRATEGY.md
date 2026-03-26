# Caching Strategy

## Pattern: Cache-Aside

The gateway uses cache-aside (also called lazy loading) rather than write-through or read-through:

```
Read request arrives
  ├─ Cache HIT  → return cached value, set X-Cache: HIT
  └─ Cache MISS → fetch from upstream
                   → store in cache with TTL
                   → return value, set X-Cache: MISS
```

The application code controls what is cached and when. The cache is never written without a prior read miss.

## TTL Decisions

| Route | TTL | Rationale |
|-------|-----|-----------|
| `GET /products` | 60s | Product lists change infrequently; 60s provides good hit rate |
| `GET /products/:id` | 120s | Single product data is stable; longer TTL reduces upstream load |
| `GET /search` | 30s | Search results depend on query; shorter TTL keeps results fresh |
| `GET /cart/:id` | 0 (no cache) | Cart state is user-specific and must always be fresh |
| `GET /health` | 0 (no cache) | Health checks must reflect real state |

## Stale-While-Revalidate

For product routes, the gateway implements stale-while-revalidate (SWR):

1. Cached value exists but TTL has expired → serve stale value immediately
2. Trigger background refresh of the upstream value
3. Next request receives the fresh value

This prevents cache stampedes (multiple simultaneous upstream calls when a popular key expires) and eliminates the latency spike that occurs when a cached value expires under high traffic.

```typescript
// Stale window: 60s TTL + 30s stale window = serve stale for up to 90s
const cache = new CacheMiddleware({ ttl: 60, staleWhileRevalidate: 30 });
```

## Storage Strategy

| Environment | Storage | Notes |
|-------------|---------|-------|
| Development (no REDIS_URL) | In-memory Map | Per-process, lost on restart |
| Production (REDIS_URL set) | Redis 7 | Shared across replicas, persistent |

The `CacheService` uses a strategy pattern — `InMemoryCacheAdapter` and `RedisCacheAdapter` both implement the same `CacheAdapter` interface. Switching storage requires only changing the `REDIS_URL` environment variable; no code changes needed.

## Cache Key Format

```
{route}:{sorted-query-params}
```

Examples:
- `products:category=apparel&page=2`
- `product:42`
- `search:hitsPerPage=20&page=1&q=blue+shirt`

Query parameters are sorted alphabetically before hashing to ensure `?page=1&category=x` and `?category=x&page=1` produce the same cache key.

## Cache Invalidation

There is no active cache invalidation. TTL expiry is the sole invalidation mechanism. This is appropriate for a read-heavy product catalog where eventual consistency (up to 60s stale) is acceptable.

For scenarios requiring immediate invalidation (flash sale price changes, inventory going to zero), the cache key can be manually deleted from Redis:

```bash
redis-cli DEL "products:category=apparel&page=1"
```

## Implementation Location

- Pattern: `src/middleware/cache.ts`
- Service: `src/services/cache.service.ts`
