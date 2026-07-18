/**
 * VoucherCartMetadata — the operational + audit snapshot written to
 * `cart.metadata.voucher` at apply/revalidate time (§14.2).
 *
 * Copied wholesale onto `order.metadata` at cart completion (verified:
 * `complete-cart.js:404`), so this is also the SOLE source
 * `recordVoucherUsageWorkflow` (§11.4, Decision D) reads at redemption for the
 * full `VoucherUsageLog` audit fields that can only be known at calculation
 * time (the cap/subtotal/promo-discount figures cannot be reconstructed later
 * from a possibly-changed cart/voucher state).
 *
 * CARRIER (Option B): the discount is carried by a `cart.credit_lines` entry
 * (see `create-voucher-credit-line.ts`), NOT the ephemeral Promotion of the
 * former Decision G. The only carrier-identity field kept here is
 * `credit_line_id` — the id of that credit line, used to detach/replace it on
 * remove/revalidate.
 */

export interface VoucherCartMetadata {
  voucher_id: string;
  code: string;
  /** The `cart.credit_lines` entry id carrying this voucher's discount — used to detach/replace it. */
  credit_line_id: string;
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
