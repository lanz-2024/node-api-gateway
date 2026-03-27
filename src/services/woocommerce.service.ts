/**
 * WooCommerce REST API client.
 *
 * Wraps HTTP calls behind a class interface so the circuit breaker, retry,
 * and DataLoader can be injected and tested without a real WC instance.
 */

import { CircuitBreaker } from '../lib/circuit-breaker.js';
import { isRetryableError, withRetry } from '../lib/retry.js';
import type { Cart, CartItem, Product, ProductsListParams } from '../types/index.js';

export interface WooCommerceServiceOptions {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  circuitBreakerThreshold?: number;
  circuitBreakerTimeoutMs?: number;
}

export class WooCommerceService {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(options: WooCommerceServiceOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.authHeader = `Basic ${Buffer.from(
      `${options.consumerKey}:${options.consumerSecret}`
    ).toString('base64')}`;

    this.circuitBreaker = new CircuitBreaker('woocommerce', {
      threshold: options.circuitBreakerThreshold ?? 5,
      timeout: options.circuitBreakerTimeoutMs ?? 30_000,
      successThreshold: 2,
    });
  }

  get circuitState(): string {
    return this.circuitBreaker.currentState;
  }

  // ─── Products ──────────────────────────────────────────────────────────────

  async getProducts(
    params: ProductsListParams = {}
  ): Promise<{ products: Product[]; total: number }> {
    return this.circuitBreaker.execute(async () => {
      return withRetry(
        async () => {
          const qs = new URLSearchParams();
          if (params.page) qs.set('page', String(params.page));
          if (params.per_page) qs.set('per_page', String(params.per_page));
          if (params.category) qs.set('category', params.category);
          if (params.search) qs.set('search', params.search);
          if (params.orderby) qs.set('orderby', params.orderby);
          if (params.order) qs.set('order', params.order);

          const url = `${this.baseUrl}/wp-json/wc/v3/products?${qs.toString()}`;
          const res = await fetch(url, { headers: this.headers() });

          if (!res.ok) {
            throw await this.httpError(res);
          }

          const products = (await res.json()) as Product[];
          const total = Number.parseInt(res.headers.get('X-WP-Total') ?? '0', 10);
          return { products, total };
        },
        { shouldRetry: isRetryableError }
      );
    });
  }

  async getProduct(id: number): Promise<Product> {
    return this.circuitBreaker.execute(async () => {
      return withRetry(
        async () => {
          const res = await fetch(`${this.baseUrl}/wp-json/wc/v3/products/${id}`, {
            headers: this.headers(),
          });
          if (!res.ok) throw await this.httpError(res);
          return (await res.json()) as Product;
        },
        { shouldRetry: isRetryableError }
      );
    });
  }

  /**
   * Batch-fetch products by IDs — called by the DataLoader to resolve N
   * individual load() calls as a single API request.
   */
  async getProductsByIds(ids: number[]): Promise<Product[]> {
    return this.circuitBreaker.execute(async () => {
      return withRetry(
        async () => {
          const include = ids.join(',');
          const url = `${this.baseUrl}/wp-json/wc/v3/products?include=${include}&per_page=${ids.length}`;
          const res = await fetch(url, { headers: this.headers() });
          if (!res.ok) throw await this.httpError(res);
          return (await res.json()) as Product[];
        },
        { shouldRetry: isRetryableError }
      );
    });
  }

  // ─── Cart ──────────────────────────────────────────────────────────────────

  async getCart(sessionToken: string): Promise<Cart> {
    return this.circuitBreaker.execute(async () => {
      const res = await fetch(`${this.baseUrl}/wp-json/wc/store/v1/cart`, {
        headers: { ...this.headers(), 'Cart-Token': sessionToken },
      });
      if (!res.ok) throw await this.httpError(res);
      return (await res.json()) as Cart;
    });
  }

  async addCartItem(
    sessionToken: string,
    productId: number,
    quantity: number,
    variationId?: number
  ): Promise<CartItem> {
    return this.circuitBreaker.execute(async () => {
      const body: Record<string, unknown> = { id: productId, quantity };
      if (variationId) body.variation_id = variationId;

      const res = await fetch(`${this.baseUrl}/wp-json/wc/store/v1/cart/add-item`, {
        method: 'POST',
        headers: {
          ...this.headers(),
          'Cart-Token': sessionToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw await this.httpError(res);
      return (await res.json()) as CartItem;
    });
  }

  async updateCartItem(sessionToken: string, itemKey: string, quantity: number): Promise<CartItem> {
    return this.circuitBreaker.execute(async () => {
      const res = await fetch(`${this.baseUrl}/wp-json/wc/store/v1/cart/update-item`, {
        method: 'POST',
        headers: {
          ...this.headers(),
          'Cart-Token': sessionToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key: itemKey, quantity }),
      });
      if (!res.ok) throw await this.httpError(res);
      return (await res.json()) as CartItem;
    });
  }

  async removeCartItem(sessionToken: string, itemKey: string): Promise<void> {
    return this.circuitBreaker.execute(async () => {
      const res = await fetch(`${this.baseUrl}/wp-json/wc/store/v1/cart/remove-item`, {
        method: 'POST',
        headers: {
          ...this.headers(),
          'Cart-Token': sessionToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key: itemKey }),
      });
      if (!res.ok) throw await this.httpError(res);
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    return {
      Authorization: this.authHeader,
      Accept: 'application/json',
    };
  }

  private async httpError(res: Response): Promise<Error> {
    const body = await res.text().catch(() => '');
    const msg = `WooCommerce API error ${res.status}: ${res.statusText} — ${body.slice(0, 200)}`;
    const err = new Error(msg) as Error & { status: number };
    err.status = res.status;
    return err;
  }
}
