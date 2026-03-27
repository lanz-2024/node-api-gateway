/**
 * Product routes.
 *
 *   GET /products        — paginated product list (WooCommerce)
 *   GET /products/:id    — single product with DataLoader N+1 batching
 *
 * DataLoader is created per-request so its in-request cache is fresh each time
 * but still batches all load() calls within the same event-loop tick.
 */

import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { createProductLoader } from '../lib/data-loader.js';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';
import type { AlgoliaService } from '../services/algolia.service.js';
import type { WooCommerceService } from '../services/woocommerce.service.js';
import type { PaginatedResponse, Product } from '../types/index.js';

interface ProductDeps {
  wooCommerce: WooCommerceService;
  algolia: AlgoliaService;
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().optional(),
  search: z.string().optional(),
  orderby: z.enum(['date', 'price', 'popularity', 'rating']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export function createProductsRouter(deps: ProductDeps): Hono {
  const router = new Hono();

  router.get('/', zValidator('query', listQuerySchema), async (c) => {
    const query = c.req.valid('query');

    const { products, total } = await deps.wooCommerce.getProducts(query);

    const totalPages = Math.ceil(total / query.per_page);

    const body: PaginatedResponse<Product> = {
      data: products,
      pagination: {
        page: query.page,
        per_page: query.per_page,
        total,
        total_pages: totalPages,
      },
    };

    return c.json(body, 200);
  });

  router.get('/:id', async (c) => {
    const rawId = c.req.param('id');
    const parsed = z.coerce.number().int().positive().safeParse(rawId);

    if (!parsed.success) {
      throw new ValidationError(`Invalid product id: ${rawId}`);
    }

    // DataLoader created per-request; batches concurrent load() calls into
    // a single WooCommerce API call within the same event-loop tick.
    const loader = createProductLoader(deps.wooCommerce);

    const product = await loader.load(parsed.data);

    if (!product) {
      throw new NotFoundError(`Product ${parsed.data} not found`);
    }

    return c.json(product, 200);
  });

  return router;
}
