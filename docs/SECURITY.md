# Security

## Authentication

Two authentication mechanisms are supported:

### JWT (Primary)
- Short-lived access tokens (15 min) + refresh tokens (7 days)
- Signed with `JWT_SECRET` env var — never committed to source
- Middleware: `src/middleware/auth.ts`

### API Keys (Secondary)
- Hashed with bcrypt before storage (never stored in plain text)
- Per-key rate limits configurable at issuance
- Revocable without affecting other keys

## Rate Limiting

Token bucket algorithm per user/IP:

```
Default: 100 requests/min per authenticated user
Unauthenticated: 20 requests/min per IP
Burst: 20 requests allowed before throttling begins
```

Implementation: `src/middleware/rate-limiter.ts`

## Input Validation

- All route parameters validated with Zod schemas — no raw `req.body` access
- URL slugs validated as `[a-z0-9-]+` pattern
- Search queries sanitized before forwarding to Algolia (length limit, character allowlist)

## Secrets Management

- All credentials stored as environment variables — never in code
- `.env.local` is gitignored; `.env.example` has placeholder values
- Production secrets stored in Vercel environment variables (encrypted at rest)
- WooCommerce consumer key/secret passed as HTTP Basic Auth header (server-only)
- Algolia search API key is read-only (safe for server use)

## Request Tracing

- Every request gets a unique correlation ID (`x-request-id` header)
- IDs propagated to downstream service calls for distributed tracing
- Implementation: `src/middleware/request-id.ts`

## Error Handling

- RFC 7807 Problem Details format — no stack traces in production responses
- Downstream errors mapped to appropriate HTTP status codes
- Circuit breaker prevents cascading failures: `src/lib/circuit-breaker.ts`

## OWASP Top 10 Coverage

| Risk | Mitigation |
|------|-----------|
| A01 Broken Access Control | JWT + API key auth on all non-public routes |
| A03 Injection | Zod validation on all inputs, no raw SQL |
| A04 Insecure Design | Circuit breaker, rate limiting, input size limits |
| A05 Security Misconfiguration | Zod env validation at startup (fail-fast), no debug endpoints in prod |
| A06 Vulnerable Components | `pnpm audit` in CI |
| A07 Auth Failures | Short JWT expiry, refresh rotation, rate limiting on auth endpoints |
| A09 Logging | Pino structured logging with correlation IDs |

## Content Security

- All API responses include `X-Content-Type-Options: nosniff`
- `Origin` header verified against `ALLOWED_ORIGINS` env var for CORS
- Strict-Transport-Security via hosting provider (Vercel/nginx)
