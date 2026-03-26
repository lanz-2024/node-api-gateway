# DataLoader: N+1 Prevention

## The N+1 Problem

Consider a product listing endpoint that returns 10 products, each with a `relatedProducts` field containing IDs of 3 related items. A naive implementation resolves each product's related items individually:

```
GET /products?category=apparel
  → fetch product list (1 API call)
  → for each of 10 products:
      → fetch related product #1 (1 call)
      → fetch related product #2 (1 call)
      → fetch related product #3 (1 call)

Total: 1 + 10×3 = 31 API calls
```

This is the N+1 problem: 1 query for the list, then N queries for each item's relations.

## DataLoader Solution

DataLoader coalesces all individual `load(id)` calls that occur within a single event loop tick into a single batched request:

```
GET /products?category=apparel
  → fetch product list (1 API call)
  → queue load(id1), load(id2), ... load(id30) in same tick
  → DataLoader batches: fetch([id1, id2, ..., id30]) (1 API call)

Total: 1 + 1 = 2 API calls
```

## Before vs After

| Scenario | Without DataLoader | With DataLoader |
|----------|--------------------|-----------------|
| 10 products, 3 related each | 31 upstream calls | 2 upstream calls |
| 20 products, 3 related each | 61 upstream calls | 2 upstream calls |
| 50 products, 3 related each | 151 upstream calls | 2 upstream calls |

The upstream call count stays constant at 2 regardless of result set size.

## Implementation

```typescript
import { DataLoader } from '../lib/data-loader.js';

const productLoader = new DataLoader<string, Product>(async (ids) => {
  // ids is a deduplicated array of all IDs queued in this tick
  const products = await wooCommerceService.getProductsByIds(ids);
  // Return results in the SAME ORDER as ids (DataLoader requirement)
  return ids.map(id => products.find(p => p.id === id) ?? new Error(`Product ${id} not found`));
});

// These three calls in the same async context are batched automatically
const [p1, p2, p3] = await Promise.all([
  productLoader.load('42'),
  productLoader.load('43'),
  productLoader.load('44'),
]);
```

## Deduplication

DataLoader also deduplicates: if the same ID is requested multiple times within a batch, it fetches it once and returns the same result to all callers.

```typescript
// Both calls receive the same result; only one upstream fetch occurs
const [a, b] = await Promise.all([
  productLoader.load('42'),
  productLoader.load('42'), // duplicate — served from batch cache
]);
```

## Cache Behavior

DataLoader maintains a per-request memoization cache. The same ID within the same request lifecycle is never fetched twice. The cache is scoped to the request — it does not persist across requests (that is the role of the Redis cache-aside layer).

## Implementation Location

`src/lib/data-loader.ts`
