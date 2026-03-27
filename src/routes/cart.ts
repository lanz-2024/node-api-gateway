/**
 * Cart routes.
 *
 *   GET    /cart/:id                    — get cart by session ID
 *   POST   /cart/:id/items              — add item to cart
 *   PUT    /cart/:id/items/:itemId      — update item quantity
 *   DELETE /cart/:id/items/:itemId      — remove item from cart
 *
 * In mock mode (no WooCommerce), carts are stored in-process memory.
 * In production the route delegates to the WooCommerceService which
 * calls the WC Store API (wc/store/v1).
 */

import { randomUUID } from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';
import type { WooCommerceService } from '../services/woocommerce.service.js';
import type { AddCartItemBody, Cart, CartItem, UpdateCartItemBody } from '../types/index.js';

interface CartDeps {
  wooCommerce: WooCommerceService;
  /** Use in-memory mock store instead of calling WooCommerce. Default: false. */
  mockMode?: boolean;
}

// ─── In-memory mock store ────────────────────────────────────────────────────

const mockStore = new Map<string, Cart>();

function getMockCart(id: string): Cart {
  let cart = mockStore.get(id);
  if (!cart) {
    cart = { items: [], total: '0.00', subtotal: '0.00', total_items: 0 };
    mockStore.set(id, cart);
  }
  return cart;
}

function recalcCart(cart: Cart): void {
  cart.total_items = cart.items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = cart.items.reduce((sum, i) => sum + Number.parseFloat(i.line_total), 0);
  cart.subtotal = subtotal.toFixed(2);
  cart.total = subtotal.toFixed(2);
}

// ─── Zod schemas ────────────────────────────────────────────────────────────

const addItemSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().int().min(1).max(999),
  variation_id: z.number().int().positive().optional(),
});

const updateItemSchema = z.object({
  quantity: z.number().int().min(1).max(999),
});

// ─── Router factory ─────────────────────────────────────────────────────────

export function createCartRouter(deps: CartDeps): Hono {
  const router = new Hono();
  const useMock = deps.mockMode ?? false;

  // GET /cart/:id
  router.get('/:id', async (c) => {
    const cartId = c.req.param('id');

    if (useMock) {
      const cart = getMockCart(cartId);
      return c.json(cart, 200);
    }

    const cart = await deps.wooCommerce.getCart(cartId);
    return c.json(cart, 200);
  });

  // POST /cart/:id/items
  router.post('/:id/items', zValidator('json', addItemSchema), async (c) => {
    const cartId = c.req.param('id');
    const body = c.req.valid('json') as AddCartItemBody;

    if (useMock) {
      const cart = getMockCart(cartId);
      const unitPrice = (Math.random() * 50 + 5).toFixed(2);
      const item: CartItem = {
        key: randomUUID(),
        product_id: body.product_id,
        variation_id: body.variation_id,
        quantity: body.quantity,
        name: `Product #${body.product_id}`,
        price: unitPrice,
        line_total: (Number.parseFloat(unitPrice) * body.quantity).toFixed(2),
      };
      cart.items.push(item);
      recalcCart(cart);
      return c.json(item, 201);
    }

    const item = await deps.wooCommerce.addCartItem(
      cartId,
      body.product_id,
      body.quantity,
      body.variation_id
    );
    return c.json(item, 201);
  });

  // PUT /cart/:id/items/:itemId
  router.put('/:id/items/:itemId', zValidator('json', updateItemSchema), async (c) => {
    const cartId = c.req.param('id');
    const itemId = c.req.param('itemId');
    const body = c.req.valid('json') as UpdateCartItemBody;

    if (useMock) {
      const cart = getMockCart(cartId);
      const item = cart.items.find((i) => i.key === itemId);
      if (!item) throw new NotFoundError(`Cart item ${itemId} not found`);
      item.quantity = body.quantity;
      item.line_total = (Number.parseFloat(item.price) * body.quantity).toFixed(2);
      recalcCart(cart);
      return c.json(item, 200);
    }

    const updated = await deps.wooCommerce.updateCartItem(cartId, itemId, body.quantity);
    return c.json(updated, 200);
  });

  // DELETE /cart/:id/items/:itemId
  router.delete('/:id/items/:itemId', async (c) => {
    const cartId = c.req.param('id');
    const itemId = c.req.param('itemId');

    if (useMock) {
      const cart = getMockCart(cartId);
      const idx = cart.items.findIndex((i) => i.key === itemId);
      if (idx === -1) throw new NotFoundError(`Cart item ${itemId} not found`);
      cart.items.splice(idx, 1);
      recalcCart(cart);
      return c.json({ deleted: true }, 200);
    }

    // Validate itemId is non-empty before delegating
    if (!itemId.trim()) throw new ValidationError('itemId is required');

    await deps.wooCommerce.removeCartItem(cartId, itemId);
    return c.json({ deleted: true }, 200);
  });

  return router;
}
