/**
 * Ephemeral, cart-specific Promotion helpers (SPEC Decision G, §14.2-A).
 *
 * The discount amount is carried into authoritative Cart/Order totals by a
 * fresh, per-cart, fixed-amount Promotion — NOT the voucher's shared/canonical
 * `VoucherConfig.promotion_id` — because `updateCartPromotionsWorkflow` has no
 * caller-supplied amount override and always derives the adjustment from the
 * Promotion's own `application_method.value` (verified against installed
 * @medusajs/core-flows/@medusajs/promotion 2.16.0 source). Reusing the shared
 * Promotion across concurrent carts would corrupt every other cart applying
 * the same voucher code.
 */

/** Prefix distinguishes ephemeral cart promotions from canonical/admin ones at a glance. */
const EPHEMERAL_CODE_PREFIX = "VEPH";

/**
 * A unique, Promotion-safe code for one cart's application of one voucher.
 * Uniqueness only needs to hold across concurrent applies (not cryptographic) —
 * cart id + timestamp + a random suffix is enough. Never derived from the
 * voucher's own code (a customer must never see or reuse this internal code).
 */
export function generateEphemeralPromotionCode(
  cartId: string,
  voucherId: string,
): string {
  const cartTag = cartId.replace(/[^a-zA-Z0-9]/g, "").slice(-8);
  const voucherTag = voucherId.replace(/[^a-zA-Z0-9]/g, "").slice(-8);
  const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${EPHEMERAL_CODE_PREFIX}-${cartTag}-${voucherTag}-${nonce}`.toUpperCase();
}

/**
 * The operational + audit snapshot written to `cart.metadata.voucher`
 * (Decision G, §14.2) at apply/revalidate time. Copied wholesale onto
 * `order.metadata` at cart completion (verified: `complete-cart.js:404`), so
 * this is also the SOLE source `recordVoucherUsageWorkflow` (§11.4, Decision D)
 * reads at redemption for the full `VoucherUsageLog` audit fields that can
 * only be known at calculation time (the cap/subtotal/promo-discount figures
 * cannot be reconstructed later from a possibly-changed cart/voucher state).
 */
export interface VoucherCartMetadata {
  voucher_id: string;
  code: string;
  /** The ephemeral Promotion's own id — identifies/detaches the cart adjustment. */
  ephemeral_promotion_id: string;
  /** The ephemeral Promotion's own code — passed to `updateCartPromotionsWorkflow`. */
  ephemeral_code: string;
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  raw_voucher_discount: number;
  voucher_discount_after_voucher_cap: number;
  /** = final_voucher_discount (§10) — the amount actually charged. */
  discount_amount: number;
  discount_capped: boolean;
  /** = voucher_discount_after_voucher_cap (§10) — pre-global-cap voucher discount. */
  original_discount: number;
  /** Snapshot of the global cap in force at apply/revalidate time (basis points). */
  cap_percentage_bps: number;
  original_subtotal: number;
  item_promotion_discount: number;
  /** Fast-path fingerprint for the revalidation loop-guard (§11.5) — not the loop's correctness mechanism. */
  revalidation_marker: string;
}

export const VOUCHER_METADATA_KEY = "voucher" as const;
