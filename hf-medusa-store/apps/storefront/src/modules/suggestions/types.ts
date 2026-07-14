/**
 * Storefront-side wire shapes for SuggestiveSelling (SUGG-001 / SUGG-004, API
 * Contract §1.1). These mirror the backend `ProductSuggestion` / `CartSuggestion`
 * shapes returned by Sơn's Store APIs — kept local because backend module types
 * are not importable across the package boundary. Consume only; never recompute.
 */

/** Tap/dismiss/add analytics context — matches backend CONTEXTS enum. */
export type SuggestionContext = "product_view" | "cart"

/**
 * The display + operational fields the two suggestion endpoints share. Product-
 * and cart-level responses differ only in provenance (`label` vs `badge_text`),
 * so the card renders against this common subset.
 */
export type SuggestionItem = {
  product_id: string
  handle: string | null
  variant_id: string | null
  name: string
  image_url: string | null
  /** Original list price, integer VND (1 = 1 VND, INT-01); null when unpriced. */
  price: number | null
  /** Promo price when an item-level promotion applies, else null. */
  discount_price: number | null
  in_stock: boolean
  requires_variant_selection: boolean
  category_names: string[]
  brand: string | null
  tier: string
  rule_id: string | null
  /** Product-level custom label ("Thường mua kèm", …); null for cart items. */
  label: string | null
  /** CR-02 free-shipping nudge ("Thêm để được Freeship!"); null otherwise. */
  badge_text: string | null
}

/** Free-shipping progress for the CR-02 nudge (2.4.10). */
export type ThresholdInfo = {
  target: number
  current: number
  remaining: number
}

export type ProductSuggestionsResponse = {
  suggestions: SuggestionItem[]
  count: number
}

export type CartSuggestionsResponse = {
  suggestions: SuggestionItem[]
  count: number
  threshold_info: ThresholdInfo | null
}

/** Client-supplied fields for POST /store/suggestion-events (2.6.12). */
export type SuggestionEventInput = {
  action: "impression" | "tap" | "add_to_cart" | "dismiss"
  source_context: SuggestionContext
  suggested_product_id: string
  rule_id?: string | null
  source_product_id?: string | null
  session_id?: string | null
  tier?: string | null
  slot?: number | null
}
