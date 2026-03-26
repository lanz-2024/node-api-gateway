/**
 * App factory.
 *
 * Creates a Hono application with all middleware and routes registered.
 * Exported as a factory function so it can be instantiated in tests without
 * starting an HTTP server.
 *
 * Middleware order (matters):
 *   1. requestId   — correlation ID for all downstream log lines
 *   2. logger      — structured pino log per request
 *   3. rateLimiter — reject excess traffic before any auth/business logic
 *   4. auth        — JWT / API key verification
 *   5. cache       — serve cached responses before hitting services
 *   6. routes      — business logic
 *   7. notFound    — 404 catch-all
 *   8. onError     — RFC 7807 error normalisation
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import pino from 'pino';
import { requestId } from './middleware/request-id.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createRateLimiter } from './middleware/rate-limiter.js';
import { createCacheMiddleware } from './middleware/cache.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createProductsRouter } from './routes/products.js';
import { createCartRouter } from './routes/cart.js';
import { createSearchRouter } from './routes/search.js';
import { createHealthRouter } from './routes/health.js';
import { WooCommerceService } from './services/woocommerce.service.js';
import { AlgoliaService } from './services/algolia.service.js';
import { createCacheService } from './services/cache.service.js';
import { env } from './config/env.js';

export interface AppOptions {
  /** Override default services (useful in tests). */
  wooCommerce?: WooCommerceService;
  algolia?: AlgoliaService;
}

export function createApp(options: AppOptions = {}): Hono {
  // ── Services ────────────────────────────────────────────────────────────────
  const wooCommerce =
    options.wooCommerce ??
    new WooCommerceService({
      baseUrl: env.WC_BASE_URL,
      consumerKey: env.WC_CONSUMER_KEY,
      consumerSecret: env.WC_CONSUMER_SECRET,
      circuitBreakerThreshold: env.CIRCUIT_BREAKER_THRESHOLD,
      circuitBreakerTimeoutMs: env.CIRCUIT_BREAKER_TIMEOUT_MS,
    });

  const algolia =
    options.algolia ??
    new AlgoliaService({
      appId: env.ALGOLIA_APP_ID,
      apiKey: env.ALGOLIA_API_KEY,
    });

  const cache = createCacheService();

  // ── Logger ──────────────────────────────────────────────────────────────────
  const logger = pino({
    level: env.NODE_ENV === 'test' ? 'silent' : (process.env['LOG_LEVEL'] ?? 'info'),
    ...(env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : {}),
  });

  // ── App ─────────────────────────────────────────────────────────────────────
  const app = new Hono();

  // CORS — allow all origins in development; tighten in production via config
  app.use(
    '*',
    cors({
      origin: env.NODE_ENV === 'production' ? [] : '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Authorization', 'Content-Type', 'X-API-Key', 'X-Request-ID'],
      exposeHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-Cache'],
    }),
  );

  // 1. Request ID
  app.use('*', requestId);

  // 2. Structured request logging
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    logger.info({
      requestId: c.get('requestId'),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
    });
  });

  // 3. Rate limiter (skip for health checks)
  app.use('/products/*', createRateLimiter(cache, env.RATE_LIMIT_REQUESTS, env.RATE_LIMIT_WINDOW_MS));
  app.use('/search/*', createRateLimiter(cache, Math.floor(env.RATE_LIMIT_REQUESTS / 2), env.RATE_LIMIT_WINDOW_MS));
  app.use('/cart/*', createRateLimiter(cache, env.RATE_LIMIT_REQUESTS, env.RATE_LIMIT_WINDOW_MS));

  // 4. Auth (skip health routes)
  const auth = createAuthMiddleware({
    jwtSecret: env.JWT_SECRET,
    apiKeys: {
      'dev-api-key-12345': ['read'],
      'admin-api-key-67890': ['read', 'write', 'admin'],
    },
  });

  app.use('/products/*', auth);
  app.use('/search/*', auth);
  app.use('/cart/*', auth);

  // 5. Cache (GET requests only)
  const cacheMiddleware = createCacheMiddleware(cache, { ttlSeconds: env.CACHE_TTL_SECONDS });
  app.use('/products/*', cacheMiddleware);
  app.use('/search/*', cacheMiddleware);

  // ── Routes ──────────────────────────────────────────────────────────────────
  const isMock = env.NODE_ENV === 'development' || env.NODE_ENV === 'test';

  app.route('/health', createHealthRouter({ cache, wooCommerce }));
  app.route('/ready', new Hono()); // placeholder — /ready is mounted inside health router
  app.route('/products', createProductsRouter({ wooCommerce, algolia }));
  app.route('/search', createSearchRouter({ algolia }));
  app.route('/cart', createCartRouter({ wooCommerce, mockMode: isMock }));

  // 7. 404 catch-all
  app.notFound(notFoundHandler);

  // 8. Error handler
  app.onError(errorHandler);

  return app;
}
