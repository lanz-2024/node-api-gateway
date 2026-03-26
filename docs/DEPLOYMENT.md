# Deployment

## Vercel (Recommended)

Deploy as a serverless Node.js service.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WC_BASE_URL` | Yes | — | WooCommerce store URL |
| `WC_CONSUMER_KEY` | Yes | — | WooCommerce REST API consumer key |
| `WC_CONSUMER_SECRET` | Yes | — | WooCommerce REST API consumer secret |
| `ALGOLIA_APP_ID` | No | — | Algolia application ID |
| `ALGOLIA_SEARCH_API_KEY` | No | — | Algolia search-only API key |
| `REDIS_URL` | No | — | Redis connection URL (falls back to in-memory) |
| `JWT_SECRET` | Yes | — | Secret for JWT signing/verification |
| `API_KEY_SALT` | Yes | — | Salt for API key hashing |
| `PORT` | No | `3001` | Server port |

### Deploy

```bash
vercel --prod
```

## Docker (Local / Production)

```bash
# Development
docker compose up -d
# App: http://localhost:3001
# Redis: localhost:6379

# Production
docker build -t node-api-gateway .
docker run -p 3001:3001 --env-file .env node-api-gateway
```

## Health Checks

```bash
# Liveness probe
curl http://localhost:3001/health

# Readiness probe (checks Redis + downstream services)
curl http://localhost:3001/health/ready
```

## Scaling

- Stateless service — scale horizontally behind a load balancer
- Rate limit state stored in Redis (shared across instances)
- In-memory cache falls back gracefully if Redis is unavailable

## Rollback

Vercel deployments are immutable — roll back via Vercel dashboard → Deployments → Promote previous deployment.
