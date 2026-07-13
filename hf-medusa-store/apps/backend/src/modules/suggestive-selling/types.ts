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

/** Structural view of a Medusa product variant (only fields we read). */
export interface VariantLike {
  id: string;
  calculated_price?: CalculatedPriceLike | null;
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
}

/** Resolved pricing context for `calculated_price` (SPEC A.4 enrich, D9). */
export interface PricingContext {
  currencyCode: string;
  regionId?: string | null;
}
