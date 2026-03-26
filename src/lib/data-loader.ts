/**
 * DataLoader for N+1 product lookup batching.
 *
 * Without batching: a cart with 10 items triggers 10 individual API calls.
 * With DataLoader:  all 10 are coalesced into a single batched API call
 *                   within the same event-loop tick.
 *
 * Additional benefits:
 *   - Per-request cache deduplication (same ID loaded twice → one fetch)
 *   - Configurable maxBatchSize to avoid oversized payloads
 */

import DataLoader from 'dataloader';
import type { Product } from '../types/index.js';
import type { WooCommerceService } from '../services/woocommerce.service.js';

export type { Product };

export function createProductLoader(wcService: WooCommerceService): DataLoader<number, Product> {
  return new DataLoader<number, Product>(
    async (ids) => {
      // Single batched API call instead of N individual calls
      const products = await wcService.getProductsByIds(Array.from(ids));
      const productMap = new Map(products.map((p) => [p.id, p]));

      // DataLoader requires results in the same order as keys,
      // and an Error entry for any key that couldn't be resolved.
      return ids.map(
        (id) => productMap.get(id) ?? new Error(`Product ${id} not found`),
      );
    },
    {
      maxBatchSize: 50,
      cache: true,
    },
  );
}
