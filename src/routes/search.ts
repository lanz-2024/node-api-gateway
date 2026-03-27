/**
 * Search route.
 *
 *   GET /search?q=&filters=&page=&hitsPerPage=
 *
 * Proxies the request to Algolia with server-side filtering applied.
 * Sensitive Algolia credentials stay server-side; clients receive only
 * normalised hit payloads.
 */

import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AlgoliaService } from '../services/algolia.service.js';

interface SearchDeps {
  algolia: AlgoliaService;
}

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  filters: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  hitsPerPage: z.coerce.number().int().min(1).max(100).default(20),
});

export function createSearchRouter(deps: SearchDeps): Hono {
  const router = new Hono();

  router.get('/', zValidator('query', searchQuerySchema), async (c) => {
    const { q, filters, page, hitsPerPage } = c.req.valid('query');

    // Normalise comma-separated filter string to Algolia facet filter array
    const facetFilters = filters
      ? filters
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean)
      : undefined;

    const result = await deps.algolia.search({
      query: q,
      page: page - 1, // Algolia is 0-based; we expose 1-based pages
      hitsPerPage,
      facetFilters,
    });

    return c.json(result, 200);
  });

  return router;
}
