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
  page?: number;
  per_page?: number;
  category?: string;
  search?: string;
  orderby?: 'date' | 'price' | 'popularity' | 'rating';
  order?: 'asc' | 'desc';
}

// ─── Cart ───────────────────────────────────────────────────────────────────

export interface CartItem {
  key: string;
  product_id: number;
  variation_id?: number;
  quantity: number;
  name: string;
  price: string;
  line_total: string;
  image?: ProductImage;
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
  image?: string;
  score?: number;
}

export interface SearchResponse {
  hits: SearchResult[];
  total: number;
  page: number;
  per_page: number;
  facets?: Record<string, SearchFacet[]>;
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
  detail?: string;
  instance?: string;
  traceId?: string;
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
