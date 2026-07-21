/**
 * Cart-metadata contract for the voucher carrier + LEGACY ephemeral-Promotion
 * code helpers.
 *
 * **Decision-4 carrier rewrite:** the discount amount is now carried by raw
 * `LineItemAdjustment` rows (`code`/`promotion_id` both null,
 * `steps/create-voucher-adjustments.ts`), not a Promotion — a fresh, per-cart
 * Promotion (as this file originally described under SPEC Decision G) could
 * not satisfy the SRS's required item-promotion-never-shrinks stacking order
 * once "item-level promotion" was redefined to mean a native automatic
 * Promotion Module adjustment (Decision H-2): see
 * `lib/create-and-attach-ephemeral-promotion.ts`'s superseded-file header for
 * the full verified mechanism (CONFLICT-8/PD-15).
 *
 * `EPHEMERAL_CODE_PREFIX`/`generateEphemeralPromotionCode` are LEGACY —
 * nothing in the current apply/remove/revalidate flow creates an ephemeral
 * Promotion anymore. Kept only so `admin/lib/check-promotion-voucher-eligibility.ts`
 * still correctly rejects any pre-existing `VEPH-*` Promotion rows from
 * before this rewrite (and so `lib/reap-ephemeral-promotions.ts` — a
 * best-effort cleanup job for exactly those legacy rows — keeps working). Do
 * not use these for new code.
 */

/** @deprecated Legacy — see file header. */
export const EPHEMERAL_CODE_PREFIX = "VEPH";

/**
 * @deprecated Legacy — see file header. A unique, Promotion-safe code for one
 * cart's application of one voucher. Uniqueness only needs to hold across
 * concurrent applies (not cryptographic) — cart id + timestamp + a random
 * suffix is enough. Never derived from the voucher's own code (a customer
 * must never see or reuse this internal code).
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
  /**
   * The raw `LineItemAdjustment` ids that carry this voucher's discount
   * (Decision-4 carrier rewrite) — identifies/removes the cart adjustments on
   * remove/replace/revalidate and lets `verifyCartTotalsStep` sum exactly
   * these rows without depending on a `promotion_id` (there is none; these
   * adjustments are never Promotion-backed).
   */
  adjustment_ids: string[];
  discount_type: "percentage" | "fixed_amount";
  discount_value: number;
  /**
   * = raw_voucher_discount (§10) — the voucher rule applied to the eligible
   * post-promotion subtotal, before either cap. NOT named `raw_voucher_discount`
   * here: Medusa's entity/response serialization treats any `raw_<x>` key as
   * the BigNumber-raw companion of a field `<x>` and silently rewrites it to
   * `{value, precision}` (plus injects a bogus sibling `voucher_discount` key)
   * wherever this JSONB blob passes through that layer (e.g. after a
   * `cart.updated` revalidation, or at `completeCartWorkflow`'s cart→order
   * metadata copy) — corrupting the value `recordVoucherUsageWorkflow` later
   * writes into the real `voucher_usage_log.raw_voucher_discount` INTEGER
   * column, which throws and silently drops the whole usage-recording step
   * (SEC/INT-02/INT-04 anti-over-redemption). The DB column and the pure
   * `calculate-discount.ts` field keep the `raw_` name (real typed values, not
   * a generic JSONB blob) — only this metadata snapshot key avoids it.
   */
  uncapped_voucher_discount: number;
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
