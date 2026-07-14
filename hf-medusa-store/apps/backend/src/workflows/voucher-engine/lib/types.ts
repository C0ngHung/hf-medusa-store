/**
 * VoucherEngine validation chain — shared types (VOUCH-002, SRS §B.3 V1–V8).
 *
 * Pure layer: these describe the plain-data inputs/outputs of the V1–V8 chain.
 * NO Medusa imports, NO I/O — the caller (apply-voucher workflow, Day 4/Thức track)
 * fetches the voucher + cart + usage count and assembles a context; the pure chain
 * only decides pass/fail. Keeps the logic unit-testable against SRS fixtures.
 */

/** Stable machine-readable error codes for V1–V8 (see errors.ts catalog, API_CONTRACT §5.1). */
export type VoucherErrorCode =
  | "VOUCHER_NOT_FOUND"
  | "VOUCHER_INACTIVE"
  | "VOUCHER_NOT_YET_VALID"
  | "VOUCHER_EXPIRED"
  | "VOUCHER_USAGE_LIMIT_REACHED"
  | "VOUCHER_PER_USER_LIMIT_REACHED"
  | "VOUCHER_MIN_ORDER_NOT_MET"
  | "VOUCHER_NO_ELIGIBLE_ITEMS"
  | "VOUCHER_SEGMENT_NOT_ELIGIBLE"
  | "VOUCHER_STACKING_CONFLICT"
  // Day 4 (Thức) additions — apply/remove/replace/redemption-time codes, not part
  // of the V1–V8 chain itself. SPEC §8.4 / API_CONTRACT §5.1.
  | "VOUCHER_REPLACE_REQUIRED"
  | "VOUCHER_CALCULATION_FAILED"
  | "VOUCHER_CART_CHANGED"
  | "VOUCHER_AUTO_REMOVED";

/**
 * Outcome of a single validator or the whole chain. Results are RETURN VALUES,
 * not thrown errors (mirrors suggestive-selling's pure evaluators). The boundary
 * layer maps a failure → BusinessError when throwing to the HTTP client.
 */
export type ValidationResult =
  | { ok: true }
  | {
      ok: false;
      code: VoucherErrorCode;
      /** HTTP status the boundary should surface (404 for NOT_FOUND, else 422). */
      http_status: number;
      /** Vietnamese customer-facing message (API_CONTRACT §6.1); may contain {placeholders}. */
      customer_message: string;
      /** Structured values to fill placeholders / aid logs (e.g. { remaining, categories }). */
      details?: Record<string, unknown>;
    };

/**
 * The subset of `voucher_config` fields the V1–V8 chain reads. All money is integer
 * VND; `discount_value` and caps are integer basis-points (out of scope for validation).
 */
export interface VoucherSnapshot {
  code: string;
  is_active: boolean;
  valid_from: Date;
  valid_to: Date;
  /** V3: null ⇒ unlimited global usage. */
  usage_limit: number | null;
  usage_count: number;
  /** V4: max uses per customer. */
  per_user_limit: number;
  /** V5: null ⇒ no minimum. Integer VND. */
  min_order_value: number | null;
  /** V6 scope: null/empty ⇒ unscoped. */
  applicable_product_ids: string[] | null;
  applicable_category_ids: string[] | null;
  /** V7: segment rules (schema undefined in SRS — Day 3 treats as pass-through). */
  user_segment_conditions: Record<string, unknown> | null;
  /** V8: false ⇒ cannot combine with item-level promotions. */
  stackable_with_promotions: boolean;
}

/** One cart line, reduced to what V5/V6 need. Integer VND. */
export interface CartLineSnapshot {
  product_id: string;
  category_ids: string[];
  quantity: number;
  unit_price: number;
}

/** Cart data the chain needs (V5 subtotal, V6 scope, V8 stacking). */
export interface CartSnapshot {
  /** V5 (decision D3): ORIGINAL pre-promotion subtotal, integer VND. */
  original_subtotal: number;
  items: CartLineSnapshot[];
  /** V8: true if the cart already has ≥1 item-level promotion applied. */
  has_item_promotion: boolean;
}

/** Full input to the V1–V8 chain. Assembled by the caller from DB + cart reads. */
export interface VoucherValidationContext {
  /** null ⇒ lookup missed ⇒ V1 NOT_FOUND. */
  voucher: VoucherSnapshot | null;
  /** V2 reference time — injected so the pure chain never reads the clock. */
  now: Date;
  cart: CartSnapshot;
  /** V4: count from voucher_usage_log(voucher_id, customer_id), supplied by caller. */
  user_usage_count: number;
}
