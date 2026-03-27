/**
 * Health routes.
 *
 *   GET /health — liveness probe (always 200 if process is up)
 *   GET /ready  — readiness probe (checks downstream dependencies)
 */

import { Hono } from 'hono';
import type { CacheService } from '../services/cache.service.js';
import type { WooCommerceService } from '../services/woocommerce.service.js';
import type { HealthStatus, ReadinessStatus } from '../types/index.js';

interface HealthDeps {
  cache: CacheService;
  wooCommerce: WooCommerceService;
  version?: string;
}

const startedAt = Date.now();

export function createHealthRouter(deps: HealthDeps): Hono {
  const router = new Hono();
  const version = deps.version ?? process.env['npm_package_version'] ?? '0.1.0';

  router.get('/health', (c) => {
    const body: HealthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    };
    return c.json(body, 200);
  });

  router.get('/ready', async (c) => {
    const [redisOk, wcOk] = await Promise.allSettled([
      deps.cache.ping(),
      // A lightweight probe: check circuit state rather than making a live call
      Promise.resolve(deps.wooCommerce.circuitState !== 'OPEN'),
    ]);

    const redisStatus: 'ok' | 'error' | 'skipped' =
      deps.cache.type === 'memory'
        ? 'skipped'
        : redisOk.status === 'fulfilled' && redisOk.value
          ? 'ok'
          : 'error';

    const wcStatus: 'ok' | 'error' = wcOk.status === 'fulfilled' && wcOk.value ? 'ok' : 'error';

    const isHealthy = wcStatus === 'ok' && redisStatus !== 'error';

    const body: ReadinessStatus = {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      checks: {
        redis: redisStatus,
        woocommerce: wcStatus,
      },
    };

    return c.json(body, isHealthy ? 200 : 503);
  });

  return router;
}
