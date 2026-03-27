/**
 * MSW handlers for downstream service mocks.
 * Used in integration tests to intercept WooCommerce and Algolia HTTP calls.
 */

import { http, HttpResponse } from 'msw';

const WC_BASE = process.env.WOOCOMMERCE_URL ?? 'http://localhost:8080';
const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID ?? 'test-app-id';
const ALGOLIA_INDEX = process.env.ALGOLIA_INDEX_NAME ?? 'products';

const mockProducts = [
  {
    id: 1,
    name: 'Classic T-Shirt',
    slug: 'classic-t-shirt',
    price: '29.99',
    sku: 'TS-001',
    stock_status: 'instock',
    images: [{ src: 'https://placehold.co/400?text=T-Shirt', alt: '' }],
  },
  {
    id: 2,
    name: 'Denim Jacket',
    slug: 'denim-jacket',
    price: '89.99',
    sku: 'DJ-001',
    stock_status: 'instock',
    images: [{ src: 'https://placehold.co/400?text=Jacket', alt: '' }],
  },
];

export const handlers = [
  // WooCommerce: list products
  http.get(`${WC_BASE}/wp-json/wc/v3/products`, ({ request }) => {
    const url = new URL(request.url);
    const include = url.searchParams.get('include');
    if (include) {
      const ids = include.split(',').map(Number);
      return HttpResponse.json(mockProducts.filter((p) => ids.includes(p.id)));
    }
    return HttpResponse.json(mockProducts);
  }),

  // WooCommerce: single product
  http.get(`${WC_BASE}/wp-json/wc/v3/products/:id`, ({ params }) => {
    const product = mockProducts.find((p) => p.id === Number(params.id));
    if (!product) {
      return HttpResponse.json(
        { code: 'woocommerce_rest_product_invalid_id', message: 'Invalid ID' },
        { status: 404 }
      );
    }
    return HttpResponse.json(product);
  }),

  // WooCommerce: store cart (read)
  http.get(`${WC_BASE}/wp-json/wc/store/v1/cart`, () => {
    return HttpResponse.json({
      items: [],
      total: '0.00',
      subtotal: '0.00',
      total_items: 0,
    });
  }),

  // WooCommerce: store cart add-item
  http.post(`${WC_BASE}/wp-json/wc/store/v1/cart/add-item`, async ({ request }) => {
    const body = (await request.json()) as { id: number; quantity: number };
    const product = mockProducts.find((p) => p.id === body.id);
    return HttpResponse.json({
      key: `mock-key-${body.id}`,
      product_id: body.id,
      quantity: body.quantity,
      name: product?.name ?? 'Unknown',
      price: product?.price ?? '0.00',
      line_total: String((Number(product?.price ?? 0) * body.quantity).toFixed(2)),
    });
  }),

  // Algolia: single-index query (used by AlgoliaService.search)
  http.post(
    `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`,
    async ({ request }) => {
      const body = (await request.json()) as {
        query?: string;
        page?: number;
        hitsPerPage?: number;
      };
      const query = body.query ?? '';
      const hits = mockProducts.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
      return HttpResponse.json({
        hits: hits.map((p) => ({
          objectID: String(p.id),
          product_id: p.id,
          name: p.name,
          price: p.price,
          sku: p.sku,
          slug: p.slug,
          image: p.images[0]?.src,
        })),
        nbHits: hits.length,
        page: body.page ?? 0,
        hitsPerPage: body.hitsPerPage ?? 20,
        processingTimeMS: 1,
        query,
      });
    }
  ),
];
