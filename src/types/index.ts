/**
 * Shared type definitions used across the gateway.
 */

// ─── Product ────────────────────────────────────────────────────────────────

export interface ProductImage {
  src: string;
  alt: string;
}

export interface Product {
  id: number;
  name: string;
  price: string;
  sku: string;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  images: ProductImage[];
  slug: string;
  description?: string;
  categories?: ProductCategory[];
}

export interface ProductCategory {
  id: number;
  name: string;
  slug: string;
}

export interface ProductsListParams {
  page?: number | undefined;
  per_page?: number | undefined;
  category?: string | undefined;
  search?: string | undefined;
  orderby?: 'date' | 'price' | 'popularity' | 'rating' | undefined;
  order?: 'asc' | 'desc' | undefined;
}

// ─── Cart ───────────────────────────────────────────────────────────────────

export interface CartItem {
  key: string;
  product_id: number;
  variation_id?: number | undefined;
  quantity: number;
  name: string;
  price: string;
  line_total: string;
  image?: ProductImage | undefined;
}

export interface Cart {
  items: CartItem[];
  total: string;
  subtotal: string;
  total_items: number;
}

export interface AddCartItemBody {
  product_id: number;
  quantity: number;
  variation_id?: number;
}

export interface UpdateCartItemBody {
  quantity: number;
}

// ─── Search ─────────────────────────────────────────────────────────────────

export interface SearchFacet {
  name: string;
  value: string;
  count: number;
}

export interface SearchResult {
  objectID: string;
  product_id: number;
  name: string;
  price: string;
  sku: string;
  slug: string;
  image?: string | undefined;
  score?: number | undefined;
}

export interface SearchResponse {
  hits: SearchResult[];
  total: number;
  page: number;
  per_page: number;
  facets?: Record<string, SearchFacet[]> | undefined;
  query: string;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  sub: string;
  email: string;
  roles: string[];
  iat: number;
  exp: number;
}

export interface AuthContext {
  userId: string;
  email: string;
  roles: string[];
  authMethod: 'jwt' | 'api_key';
}

// ─── API Errors (RFC 7807 Problem Details) ──────────────────────────────────

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string | undefined;
  instance?: string | undefined;
  traceId?: string | undefined;
}

// ─── Health ──────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  uptime: number;
}

export interface ReadinessStatus extends HealthStatus {
  checks: {
    redis: 'ok' | 'error' | 'skipped';
    woocommerce: 'ok' | 'error';
  };
}

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}
