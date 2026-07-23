/**
 * SuggestiveSelling shared types — SPEC A.4 / A.5 / A.10.
 *
 * Plain TypeScript only (no Medusa runtime imports) so the pure evaluator
 * pipeline and its unit tests can depend on these without loading the framework.
 * External shapes (Medusa `calculated_price`, product variant) are described
 * structurally — we only depend on the fields we read.
 */

/** Suggestion tier band — priority order manual > category > behavioral (BR-01). */
export type SuggestionTier = "manual" | "category" | "behavioral";

/**
 * Why a candidate was dropped by the BR-02 filter. Provenance is kept for the
 * admin dry-run / debug logs only (SPEC A.5); it is not serialized to customers.
 */
export type DropReason =
  | "in_cart" // BR-02(a)
  | "out_of_stock" // BR-02(b)
  | "dismissed" // BR-02(c)
  | "recent_purchase" // BR-02(d)
  | "self" // BR-02(e) — product-context only
  | "inactive"; // BR-02(f)

/** A candidate produced by tier resolution, before product enrichment. */
export interface RawCandidate {
  product_id: string;
  tier: SuggestionTier;
  rule_id: string | null;
  display_order: number;
  custom_label: string | null;
}

/** Structural view of Medusa's variant `calculated_price` (only fields we read). */
export interface CalculatedPriceLike {
  calculated_amount?: number | null;
  original_amount?: number | null;
}

/** A single inventory location level — real (non-computed) stock columns. */
export interface InventoryLevelLike {
  stocked_quantity?: number | null;
  reserved_quantity?: number | null;
}

/** Structural view of a Medusa product variant (only fields we read). */
export interface VariantLike {
  id: string;
  calculated_price?: CalculatedPriceLike | null;
  /** False → Medusa does not track inventory → always purchasable. */
  manage_inventory?: boolean | null;
  /** True → orderable even at zero available. */
  allow_backorder?: boolean | null;
  /**
   * Inventory linked to the variant. Available = stocked − reserved, summed over
   * location_levels. `available_quantity` is a Medusa .computed() field that reads
   * back undefined via query.graph, so we derive it from these real columns.
   */
  inventory_items?: Array<{
    inventory?: {
      location_levels?: InventoryLevelLike[] | null;
    } | null;
  }> | null;
}

/** A candidate after product data has been attached (price, stock, variant, taxonomy). */
export interface EnrichedCandidate extends RawCandidate {
  handle: string | null;
  name: string;
  image_url: string | null;
  status: string;
  category_names: string[];
  brand: string | null;
  variant_id: string | null;
  requires_variant_selection: boolean;
  in_stock: boolean;
  price: number | null;
  discount_price: number | null;
}

/**
 * Per-customer inputs for the BR-02 filter. These are resolved at request time
 * (not cached — D7) so one cached candidate buffer personalizes to every viewer.
 */
export interface FilterContext {
  /** Product being viewed — never suggest itself (BR-02(e)). */
  sourceProductId?: string | null;
  /** Products already in the cart (BR-02(a)). */
  cartProductIds: Set<string>;
  /** Products dismissed this session for this context (BR-02(c)). */
  dismissedProductIds: Set<string>;
  /** Products bought within the recent window (BR-02(d)); empty for guests (BR-08). */
  recentlyPurchasedProductIds: Set<string>;
  /** Category names exempt from the recent-purchase filter (consumables, BR-02(d)). */
  consumableCategories: Set<string>;
}

/** Result of the BR-02 filter: survivors + dropped provenance (for dry-run/log). */
export interface FilterOutcome {
  kept: EnrichedCandidate[];
  dropped: Array<{ product_id: string; reason: DropReason }>;
}

/**
 * Wire shape of a single product suggestion — API Contract §1.1.
 * The six task-mandated display fields are `image_url`, `name`, `price`,
 * `discount_price`, `label` and `display_order`; the rest are the operational
 * fields the contract requires (variant resolution, stock, taxonomy, provenance).
 */
export interface ProductSuggestion {
  product_id: string;
  handle: string | null;
  variant_id: string | null;
  name: string;
  image_url: string | null;
  price: number | null;
  discount_price: number | null;
  in_stock: boolean;
  requires_variant_selection: boolean;
  status: string;
  category_names: string[];
  brand: string | null;
  tier: SuggestionTier;
  rule_id: string | null;
  label: string | null;
  display_order: number;
}

/** Per-request context handed to the engine for a product-detail evaluation. */
export interface ProductEvaluationRequest {
  /** Clamped to [1, PRODUCT_LIMIT] by the caller. */
  limit: number;
  /** Cart used to source pricing context + in-cart filter. */
  cartId?: string | null;
  /** Authenticated customer (from auth context); null for guests (BR-08). */
  customerId?: string | null;
  /** Session scope for dismissals/analytics (from `x-session-id`). */
  sessionId?: string | null;
  /**
   * Products dismissed this session for the `product_view` context (BR-02(c) / D6).
   * A plain array (not a Set) because it crosses the workflow boundary and must
   * serialize; the engine rehydrates it to a Set for the filter.
   */
  dismissedProductIds?: string[];
}

/** Resolved pricing context for `calculated_price` (SPEC A.4 enrich, D9). */
export interface PricingContext {
  currencyCode: string;
  regionId?: string | null;
}

// ── Cart-level suggestions ("You Might Also Need", SUGG-004 / SPEC A.6) ──

/** The four cart-rule codes, evaluated in this fixed order (BR-03 / 2.4.7). */
export type CartRuleCode = "CR-01" | "CR-02" | "CR-03" | "CR-04";

/**
 * A product after enrichment, independent of any suggestion provenance. Produced
 * by `enrichProductRow` (pure) and shared by cart-rule candidate generation. Cart
 * rules attach their own `rule_code`/`badge` on top when projecting to the wire.
 */
export interface EnrichedProduct {
  product_id: string;
  handle: string | null;
  name: string;
  image_url: string | null;
  status: string;
  category_ids: string[];
  category_names: string[];
  brand: string | null;
  variant_id: string | null;
  requires_variant_selection: boolean;
  in_stock: boolean;
  /** Original list price, floored to integer VND (INT-01); null when unpriced. */
  price: number | null;
  /** Promo price when an item-level promotion applies (calculated < original), else null. */
  discount_price: number | null;
}

/**
 * Wire shape of a single cart-level suggestion — API Contract §1.1.
 * `tier` is always `"cart"`; `rule_code` carries the CR-0x that produced it and
 * `badge_text` the CR-02 nudge (null for the others). `rule_id` is null: cart
 * suggestions are attributed by CR code, not by rule id (prompt 3.2 / BR-04).
 */
export interface CartSuggestion {
  product_id: string;
  handle: string | null;
  variant_id: string | null;
  name: string;
  image_url: string | null;
  price: number | null;
  discount_price: number | null;
  in_stock: boolean;
  requires_variant_selection: boolean;
  status: string;
  category_names: string[];
  brand: string | null;
  tier: "cart";
  rule_id: null;
  rule_code: CartRuleCode;
  badge_text: string | null;
}

/**
 * Free-shipping progress for the CR-02 nudge (API Contract §1.1). Non-null only
 * when CR-02 fired AND the response carries at least one suggestion (2.4.9/2.4.10).
 */
export interface ThresholdInfo {
  target: number;
  current: number;
  remaining: number;
}

/** Raw (pre-dismissal-filter) cart evaluation output, cached per cart in Day-4 (BR-06). */
export interface CartRawResult {
  candidates: CartSuggestion[];
  threshold_info: ThresholdInfo | null;
}

/** Per-request context for a cart-level evaluation (SPEC A.4 evaluateCart). */
export interface CartEvaluationRequest {
  /** Clamped to [1, CART_LIMIT] by the caller. */
  limit: number;
  /** Authenticated customer (from auth context); null for guests (BR-08). */
  customerId?: string | null;
  /** Session scope for dismissals/analytics (from `x-session-id`). */
  sessionId?: string | null;
  /**
   * Products dismissed this session for the `cart` context (D6). A plain array
   * (not a Set) because it crosses the workflow boundary and must serialize; the
   * engine rehydrates it to a Set for the filter.
   */
  dismissedProductIds?: string[];
}
