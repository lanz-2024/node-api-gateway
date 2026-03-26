# Changelog

## [0.1.0] - 2026-03-27

### Added
- Hono 4 server with Node.js adapter and typed route definitions
- JWT authentication middleware with refresh token rotation
- API key authentication with bcrypt hashing
- Token bucket rate limiter (per-user and per-IP)
- Cache-aside middleware with stale-while-revalidate (Redis or in-memory)
- Request correlation ID middleware for distributed tracing
- RFC 7807 Problem Details error handler
- DataLoader for N+1 request batching (`src/lib/data-loader.ts`)
- Circuit breaker with CLOSED→OPEN→HALF_OPEN state machine (`src/lib/circuit-breaker.ts`)
- Exponential backoff retry with jitter (`src/lib/retry.ts`)
- WooCommerce REST service with dependency injection
- Algolia search proxy with server-side filtering
- Products aggregation route (WooCommerce + Algolia)
- Cart CRUD routes
- Search route with faceted filtering
- Health check routes (liveness + readiness probes)
- OpenAPI 3.1 spec (`openapi/spec.yaml`)
- MSW mock handlers for WooCommerce REST and Algolia APIs
- Vitest unit tests: DataLoader batching, circuit breaker FSM, rate limiter
- GitHub Actions CI: typecheck → lint → test → build
- Docker Compose: App + Redis + mock WooCommerce
- docs/: ARCHITECTURE.md, TESTING.md, DATA-LOADER.md, CIRCUIT-BREAKER.md, CACHING-STRATEGY.md, DEPLOYMENT.md, SECURITY.md, CHANGELOG.md

### Depends on
- nextjs-headless-storefront (optional consumer — storefront can use this as API layer)
