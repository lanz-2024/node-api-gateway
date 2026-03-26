# Architecture

## Overview

The gateway is a single Node.js process built on Hono that sits between clients and two upstream APIs: WooCommerce REST and Algolia Search. It handles cross-cutting concerns (auth, rate limiting, caching, error formatting) in middleware before requests reach route handlers.

## Middleware Chain Order

Requests flow through middleware in this exact order:

```
Request
  → requestId        (attaches X-Request-ID to every log line)
  → pino logger      (structured JSON logs with correlation ID)
  → error handler    (catches unhandled errors, formats as RFC 7807)
  → rate limiter     (token bucket per IP, 100 req/min)
  → auth             (JWT bearer or X-API-Key — skipped for /health, /ready)
  → cache            (cache-aside read; sets cache on response for GET routes)
  → route handler    (products / search / cart / health)
  → DataLoader       (batches product ID lookups before upstream fetch)
  → upstream service (WooCommerce or Algolia)
Response
```

## Service Interaction

```mermaid
graph TD
    Client -->|HTTP| Hono[Hono App]
    Hono --> MW[Middleware Stack]
    MW --> Products[/products routes]
    MW --> Search[/search routes]
    MW --> Cart[/cart routes]
    MW --> Health[/health + /ready]
    Products --> DL[DataLoader]
    DL --> WC[WooCommerce Service]
    Search --> Algolia[Algolia Service]
    Cart --> WC
    WC --> Redis[(Redis Cache)]
    Algolia --> Redis
    WC -->|REST| WCApi[WooCommerce API]
    Algolia -->|REST| AlgoliaApi[Algolia API]
```

## Key Decisions

### Why Hono over Express

- **Edge-ready**: Hono runs on Cloudflare Workers, Deno Deploy, and Bun without code changes — Express cannot.
- **TypeScript-first**: Route handler types are inferred from schema definitions with no extra boilerplate.
- **Performance**: Hono's router is ~3x faster than Express under benchmark conditions (radix tree vs linear scan).
- **Size**: Hono adds ~14KB to the bundle; Express adds ~200KB with its dependency tree.

### Why DataLoader

The WooCommerce REST API has no batch-by-IDs endpoint on product listings. A naive implementation that resolves related products one-by-one generates O(n) upstream calls per request. DataLoader coalesces all ID lookups within a single event loop tick into a single batched fetch, reducing 10 upstream calls to 1.

### Why Token Bucket over Leaky Bucket

Token bucket allows short bursts (useful for search-as-you-type clients) while still enforcing a long-run rate. Leaky bucket enforces a strict constant rate, which rejects legitimate burst traffic. The burst allowance is set to 20 requests.

### Why Redis for Cache and Rate Limit State

In-memory state does not survive restarts and cannot be shared across horizontal replicas. Redis provides a shared, persistent store for both concerns with sub-millisecond latency. The service degrades gracefully to in-memory when `REDIS_URL` is absent (development mode).

## Data Flow: Product List Request

1. Client sends `GET /products?page=2&category=apparel`
2. `requestId` attaches UUID to context
3. Logger records incoming request with ID, method, path
4. Rate limiter checks token bucket for client IP — consumes 1 token
5. Auth middleware: no Authorization header → continues (products are public)
6. Cache middleware: checks Redis key `products:page=2:category=apparel` — miss
7. Route handler calls `WooCommerceService.listProducts({ page: 2, category: 'apparel' })`
8. Service calls WooCommerce REST API
9. Response stored in Redis with 60s TTL
10. Cache middleware sets `X-Cache: MISS` header
11. Client receives JSON with `data[]` and `pagination` envelope

On subsequent requests within 60s, step 8 is skipped and `X-Cache: HIT` is returned.
