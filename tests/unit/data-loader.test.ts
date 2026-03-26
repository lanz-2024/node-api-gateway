/**
 * DataLoader unit tests.
 *
 * The key invariant: N separate load() calls within the same event-loop tick
 * are coalesced into a SINGLE batchLoadFn invocation, not N individual calls.
 */

import { describe, it, expect, vi } from 'vitest';
import { createProductLoader } from '../../src/lib/data-loader.js';
import type { WooCommerceService } from '../../src/services/woocommerce.service.js';
import type { Product } from '../../src/types/index.js';

function makeProduct(id: number): Product {
  return {
    id,
    name: `Product ${id}`,
    price: '9.99',
    sku: `SKU-${id}`,
    stock_status: 'instock',
    images: [],
    slug: `product-${id}`,
  };
}

function makeMockService(products: Product[]): WooCommerceService {
  return {
    getProductsByIds: vi.fn(async (ids: number[]) => {
      return ids.map((id) => products.find((p) => p.id === id) ?? makeProduct(id));
    }),
  } as unknown as WooCommerceService;
}

describe('createProductLoader', () => {
  it('resolves a single product by id', async () => {
    const products = [makeProduct(1)];
    const service = makeMockService(products);
    const loader = createProductLoader(service);

    const result = await loader.load(1);
    expect(result.id).toBe(1);
  });

  it('batches N concurrent load() calls into 1 API call', async () => {
    const products = [1, 2, 3, 4, 5].map(makeProduct);
    const service = makeMockService(products);
    const loader = createProductLoader(service);

    // All five load() calls happen in the same tick — DataLoader batches them
    const results = await Promise.all([1, 2, 3, 4, 5].map((id) => loader.load(id)));

    expect(results.map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
    // Critical: getProductsByIds must have been called exactly ONCE
    expect(service.getProductsByIds).toHaveBeenCalledTimes(1);
    expect(service.getProductsByIds).toHaveBeenCalledWith([1, 2, 3, 4, 5]);
  });

  it('deduplicates repeated loads of the same id within one batch', async () => {
    const service = makeMockService([makeProduct(42)]);
    const loader = createProductLoader(service);

    // Load id=42 three times in the same tick
    const [a, b, c] = await Promise.all([loader.load(42), loader.load(42), loader.load(42)]);

    expect(a.id).toBe(42);
    expect(b.id).toBe(42);
    expect(c.id).toBe(42);
    // Only one API call despite three load() calls
    expect(service.getProductsByIds).toHaveBeenCalledTimes(1);
    expect((service.getProductsByIds as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toEqual([42]);
  });

  it('returns an Error entry for ids that cannot be resolved', async () => {
    // Service returns empty array — all ids are missing
    const service = {
      getProductsByIds: vi.fn(async () => []),
    } as unknown as WooCommerceService;

    const loader = createProductLoader(service);
    const result = await loader.load(99).catch((e: unknown) => e);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain('99');
  });

  it('respects maxBatchSize and splits into multiple batches if needed', async () => {
    // maxBatchSize in data-loader.ts is 50; send 60 ids
    const ids = Array.from({ length: 60 }, (_, i) => i + 1);
    const service = makeMockService(ids.map(makeProduct));
    const loader = createProductLoader(service);

    const results = await Promise.all(ids.map((id) => loader.load(id)));
    expect(results).toHaveLength(60);
    // Should have been called twice (50 + 10)
    expect(service.getProductsByIds).toHaveBeenCalledTimes(2);
  });
});
