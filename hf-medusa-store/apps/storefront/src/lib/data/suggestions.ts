"use server"

import { sdk } from "@lib/config"
import {
  CartSuggestionsResponse,
  ProductSuggestionsResponse,
  SuggestionEventInput,
} from "@modules/suggestions/types"
import { getAuthHeaders } from "./cookies"
import { deleteLineItem, retrieveCart, updateLineItem } from "./cart"

/**
 * Storefront data access for SuggestiveSelling (tasks 4.4.1/4.4.5/4.4.9). All
 * calls hit Sơn's Store APIs through the single shared `sdk` client and degrade
 * to empty on any failure so the UI simply hides the section (BR-10 / 4.4.8) —
 * the suggestion path must never surface an error to the shopper.
 */

/**
 * GET /store/products/:id/suggestions (SUGG-001). `cartId` enables the in-cart
 * filter + cart-region pricing; `no-store` keeps results personalised and lets
 * the section re-fetch on each render (the backend owns the Redis cache, 2.6.x).
 */
export async function listProductSuggestions({
  productId,
  cartId,
  limit,
  sessionId,
}: {
  productId: string
  cartId?: string | null
  limit?: number
  sessionId?: string | null
}): Promise<ProductSuggestionsResponse> {
  const headers: Record<string, string> = { ...(await getAuthHeaders()) }
  if (sessionId) headers["x-session-id"] = sessionId

  return sdk.client
    .fetch<ProductSuggestionsResponse>(
      `/store/products/${productId}/suggestions`,
      {
        method: "GET",
        query: {
          ...(cartId ? { cart_id: cartId } : {}),
          ...(limit ? { limit } : {}),
        },
        headers,
        cache: "no-store",
      },
    )
    .catch(() => ({ suggestions: [], count: 0 }))
}

/**
 * GET /store/carts/:id/suggestions (SUGG-004). Fetched fresh on every cart
 * render so add/remove auto-refreshes the "You Might Also Need" section (4.4.9),
 * matched by the backend `cart.updated` cache invalidation (2.6.6).
 */
export async function listCartSuggestions({
  cartId,
  limit,
  sessionId,
}: {
  cartId: string
  limit?: number
  sessionId?: string | null
}): Promise<CartSuggestionsResponse> {
  const headers: Record<string, string> = { ...(await getAuthHeaders()) }
  if (sessionId) headers["x-session-id"] = sessionId

  return sdk.client
    .fetch<CartSuggestionsResponse>(`/store/carts/${cartId}/suggestions`, {
      method: "GET",
      query: { ...(limit ? { limit } : {}) },
      headers,
      cache: "no-store",
    })
    .catch(() => ({ suggestions: [], count: 0, threshold_info: null }))
}

/**
 * POST /store/suggestion-events (SUGG-006). Fire-and-forget analytics: the
 * endpoint always answers 202, and we swallow transport errors so tracking can
 * never block or break the shopper's interaction. `customer_id` is resolved
 * server-side from the auth context — never sent from here (SEC-04).
 */
export async function trackSuggestionEvents(
  events: SuggestionEventInput[],
): Promise<void> {
  if (!events.length) return

  const headers: Record<string, string> = { ...(await getAuthHeaders()) }
  const sessionId = events.find((e) => e.session_id)?.session_id
  if (sessionId) headers["x-session-id"] = sessionId

  try {
    await sdk.client.fetch(`/store/suggestion-events`, {
      method: "POST",
      body: { events },
      headers,
      cache: "no-store",
    })
  } catch {
    // best-effort — tracking failures are non-fatal (SUGG-006).
  }
}

/**
 * Undo a one-tap add (4.4.3): remove one unit of `variantId` from the current
 * cart — decrement the line when quantity > 1, otherwise delete it. Orchestrates
 * the existing cart server actions so cart mutation logic stays in cart.ts.
 */
export async function undoAddSuggestedItem({
  variantId,
}: {
  variantId: string
}): Promise<void> {
  const cart = await retrieveCart()
  const line = cart?.items?.find((item) => item.variant_id === variantId)
  if (!line) return

  if ((line.quantity ?? 0) > 1) {
    await updateLineItem({ lineId: line.id, quantity: line.quantity - 1 })
  } else {
    await deleteLineItem(line.id)
  }
}
