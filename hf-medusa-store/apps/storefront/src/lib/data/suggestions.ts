"use server"

import { revalidateTag } from "next/cache"
import { sdk } from "@lib/config"
import {
  CartSuggestionsResponse,
  ProductSuggestionsResponse,
  SuggestionContext,
  SuggestionEventInput,
} from "@modules/suggestions/types"
import { getAuthHeaders, getCacheTag, getSuggestionSessionId } from "./cookies"
import {
  deleteLineItem,
  getOrSetCart,
  retrieveCart,
  updateLineItem,
} from "./cart"

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
  const resolvedSession = sessionId ?? (await getSuggestionSessionId())
  if (resolvedSession) headers["x-session-id"] = resolvedSession

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
  const resolvedSession = sessionId ?? (await getSuggestionSessionId())
  if (resolvedSession) headers["x-session-id"] = resolvedSession

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
  // Prefer an explicit per-event session_id; else fall back to the browser's
  // suggestion-session cookie so guest dismissals land in this browser's scope
  // (and match the id the read path sends). Ignored server-side when logged in.
  const sessionId =
    events.find((e) => e.session_id)?.session_id ??
    (await getSuggestionSessionId())
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

/**
 * One-tap add WITH attribution (SUGG-003): POST /store/carts/:id/suggested-items
 * (the attributed endpoint), NOT the generic addToCart. The backend workflow
 * persists the attribution onto the line item's metadata, re-checks stock
 * authoritatively, dedupes via Idempotency-Key, and emits the authoritative
 * `add_to_cart` event server-side (2.6.10) — so the caller must NOT also track it.
 *
 * Creates the cart if none exists (getOrSetCart, mirroring addToCart) and
 * revalidates the cart cache so the storefront reflects the new line.
 *
 * Returns a typed result instead of throwing for expected outcomes. EC-07: the
 * backend re-checks stock at execution and answers 409 SUGGESTION_STOCK_CONFLICT
 * when the suggested item just went out of stock — we MUST detect that here on
 * the server, because Next.js strips custom error fields (like `status`) when an
 * error crosses the server-action boundary, so the client could never tell a
 * 409 from any other failure. Unexpected setup failures still throw.
 */
export type AddSuggestedItemResult =
  | { status: "ok"; lineItemId: string | null; isReplay: boolean }
  | { status: "out_of_stock" }
  | { status: "error" }

export async function addSuggestedItem({
  productId,
  variantId,
  countryCode,
  idempotencyKey,
  attribution,
  slot,
}: {
  productId: string
  variantId: string
  countryCode: string
  idempotencyKey: string
  attribution: {
    rule_id?: string | null
    source_context: SuggestionContext
    source_product_id?: string | null
  }
  slot?: number | null
}): Promise<AddSuggestedItemResult> {
  const cart = await getOrSetCart(countryCode)
  if (!cart) throw new Error("Error retrieving or creating cart")

  const headers: Record<string, string> = {
    ...(await getAuthHeaders()),
    "idempotency-key": idempotencyKey,
  }

  let res: {
    line_item: { id: string } | null
    updated_cart_total: number
    is_idempotent_replay: boolean
  }
  try {
    res = await sdk.client.fetch(`/store/carts/${cart.id}/suggested-items`, {
      method: "POST",
      body: {
        product_id: productId,
        variant_id: variantId,
        quantity: 1,
        ...(slot != null ? { slot } : {}),
        attribution,
      },
      headers,
      cache: "no-store",
    })
  } catch (e) {
    // FetchError carries the numeric HTTP status (readable here, on the server).
    // 409 → the item sold out between render and tap (EC-07); any other status
    // is an unexpected add failure.
    const status = (e as { status?: number })?.status
    return status === 409 ? { status: "out_of_stock" } : { status: "error" }
  }

  const cartCacheTag = await getCacheTag("carts")
  revalidateTag(cartCacheTag)
  const fulfillmentCacheTag = await getCacheTag("fulfillment")
  revalidateTag(fulfillmentCacheTag)

  return {
    status: "ok",
    lineItemId: res.line_item?.id ?? null,
    isReplay: res.is_idempotent_replay,
  }
}

/** Undo a one-tap add (SF-04) by the exact line item id returned from the add. */
export async function undoSuggestedItem({
  lineId,
}: {
  lineId: string
}): Promise<void> {
  await deleteLineItem(lineId)
}
