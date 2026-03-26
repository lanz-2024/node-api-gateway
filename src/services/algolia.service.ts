/**
 * Algolia search client.
 *
 * Uses the Algolia REST API directly (no SDK dependency) so the gateway
 * stays lean. Protected by its own circuit breaker.
 */

import type { SearchResult, SearchResponse } from '../types/index.js';
import { CircuitBreaker } from '../lib/circuit-breaker.js';

export interface AlgoliaServiceOptions {
  appId: string;
  apiKey: string;
  indexName?: string;
}

export interface AlgoliaSearchParams {
  query: string;
  page?: number;
  hitsPerPage?: number;
  facets?: string[];
  facetFilters?: string[];
}

interface AlgoliaHit {
  objectID: string;
  product_id?: number;
  name?: string;
  price?: string;
  sku?: string;
  slug?: string;
  image?: string;
  _rankingInfo?: { nbTypos: number };
}

interface AlgoliaSearchResponse {
  hits: AlgoliaHit[];
  nbHits: number;
  page: number;
  hitsPerPage: number;
  facets?: Record<string, Record<string, number>>;
}

export class AlgoliaService {
  private readonly appId: string;
  private readonly apiKey: string;
  private readonly indexName: string;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(options: AlgoliaServiceOptions) {
    this.appId = options.appId;
    this.apiKey = options.apiKey;
    this.indexName = options.indexName ?? 'products';

    this.circuitBreaker = new CircuitBreaker('algolia', {
      threshold: 5,
      timeout: 15_000,
      successThreshold: 2,
    });
  }

  async search(params: AlgoliaSearchParams): Promise<SearchResponse> {
    return this.circuitBreaker.execute(async () => {
      const body: Record<string, unknown> = {
        query: params.query,
        page: params.page ?? 0,
        hitsPerPage: params.hitsPerPage ?? 20,
      };

      if (params.facets?.length) body['facets'] = params.facets;
      if (params.facetFilters?.length) body['facetFilters'] = params.facetFilters;

      const url = `https://${this.appId}-dsn.algolia.net/1/indexes/${this.indexName}/query`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Algolia-Application-Id': this.appId,
          'X-Algolia-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Algolia search error ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = (await res.json()) as AlgoliaSearchResponse;

      const hits: SearchResult[] = data.hits.map((h) => ({
        objectID: h.objectID,
        product_id: h.product_id ?? 0,
        name: h.name ?? '',
        price: h.price ?? '0.00',
        sku: h.sku ?? '',
        slug: h.slug ?? '',
        image: h.image,
      }));

      // Transform Algolia facets → our format
      const facets = data.facets
        ? Object.fromEntries(
            Object.entries(data.facets).map(([facetName, values]) => [
              facetName,
              Object.entries(values).map(([value, count]) => ({
                name: facetName,
                value,
                count,
              })),
            ]),
          )
        : undefined;

      return {
        hits,
        total: data.nbHits,
        page: data.page + 1, // normalize to 1-based
        per_page: data.hitsPerPage,
        facets,
        query: params.query,
      };
    });
  }
}
