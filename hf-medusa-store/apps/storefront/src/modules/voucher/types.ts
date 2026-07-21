/**
 * Storefront-side wire shapes for VoucherEngine (VOUCH-001..005). `VoucherCartMetadata`
 * mirrors the EXACT snapshot the backend persists to `cart.metadata.voucher` —
 * verified against `apps/backend/src/workflows/voucher-engine/apply-voucher.ts`'s
 * `voucherSnapshot` transform, NOT the idealized shape assumed in
 * `docs/voucher-engine-ui/UX-FLOW.md` §2.
 *
 * UPDATED 2026-07-22: `adjustment_ids` replaces the old `ephemeral_promotion_id`/
 * `ephemeral_code` fields — the backend's Decision-4 carrier rewrite
 * (2026-07-20) stopped carrying the voucher discount via a per-cart ephemeral
 * Promotion; it now writes raw `LineItemAdjustment` rows directly (`code:
 * null`, `promotion_id: null`), which never appear in `cart.promotions` at
 * all. This type had drifted out of sync with that change (still declaring
 * the old fields) until this fix — nothing in this app actually read
 * `ephemeral_promotion_id` correctly since the rewrite, since the field
 * simply doesn't exist in the real payload.
 *
 * `voucher_discount_after_voucher_cap`/`cap_percentage_bps`/`discount_amount`
 * are enough to reconstruct the exact Vietnamese cap-explanation sentence
 * client-side (see `discount-code/index.tsx`'s `buildCapExplanationVi`) —
 * there is still NO `cap_explanation` string persisted here (only in the
 * apply-response envelope below), so a page reload/out-of-band cart change
 * must derive it from these numeric fields, not expect the string itself.
 */
export type VoucherCartMetadata = {
  voucher_id: string
  code: string
  /** The raw `LineItemAdjustment` row ids carrying this voucher's discount (Decision-4 carrier rewrite). */
  adjustment_ids: string[]
  discount_type: "percentage" | "fixed_amount"
  discount_value: number
  /** = raw_voucher_discount (§10) — named without the `raw_` prefix on this
   * JSONB snapshot to avoid colliding with Medusa's generic BigNumber-raw-field
   * decoration convention. */
  uncapped_voucher_discount: number
  voucher_discount_after_voucher_cap: number
  /** = final_voucher_discount — the amount actually charged. */
  discount_amount: number
  discount_capped: boolean
  original_discount: number
  cap_percentage_bps: number
  original_subtotal: number
  item_promotion_discount: number
  revalidation_marker: string
}

/**
 * `cart.metadata.voucher_notice` — the async auto-remove notice
 * `revalidateVoucherWorkflow` writes when a cart mutation invalidates the
 * active voucher (SPEC §11.3 step 3b/§8.4). Verified against
 * `workflows/voucher-engine/lib/auto-remove-notice.ts`'s
 * `VoucherAutoRemoveNotice`. `customer_message` is pre-filled server-side —
 * render it verbatim, never reformat `reason_vi`/`voucher_code` client-side.
 *
 * KNOWN GAP: the backend does not clear this key after a later successful
 * (re)apply, so it persists in `cart.metadata` indefinitely once written. The
 * storefront only surfaces it on the live transition it observes (an active
 * voucher disappearing on the same render this key is populated) and never
 * re-shows an already-surfaced notice for the same voucher — this avoids
 * resurfacing a stale notice on an unrelated later page load, but also means
 * a customer who reloads the page strictly after the auto-removal (without
 * ever seeing the transition) will not see it retroactively.
 */
export type VoucherAutoRemoveNotice = {
  code: "VOUCHER_AUTO_REMOVED"
  reason_code: string
  voucher_code: string
  reason_vi: string
  customer_message: string
}

/**
 * `POST /store/carts/:id/voucher` success envelope (SPEC §8.1) — verified
 * against `apply-voucher.ts`'s `response` transform, byte-for-byte.
 */
export type ApplyVoucherResult = {
  success: true
  discount_amount: number
  discount_capped: boolean
  cap_explanation: string | null
  updated_cart_total: number
  voucher_details: {
    code: string
    type: "percentage" | "fixed_amount"
    value: number
    expires_at: string
  }
}

/**
 * `DELETE /store/carts/:id/voucher` success envelope (SPEC §8.2) — verified
 * against `remove-voucher.ts`. Idempotent 200 no-op if nothing was active.
 */
export type RemoveVoucherResult = {
  success: true
  updated_cart_total: number
  message: string
}

/**
 * `GET /store/customers/me/vouchers` list item. **Corrected finding (verified
 * against the running backend, supersedes an earlier "public list for
 * everyone" claim, which was wrong):** core Medusa applies a blanket
 * `authenticate("customer", ["session","bearer"])` middleware to the wildcard
 * path `/store/customers/me*`, which intercepts this custom route regardless
 * of its own handler code — a guest request returns `401`, not `200`. The
 * frontend does not need a dedicated branch for this:
 * `fetchAvailableVouchers()` (`lib/data/voucher.ts`) catches any failure and
 * resolves to `[]`, so a guest simply sees the ordinary empty-list state. See
 * `docs/voucher-engine-ui/REQUIREMENTS.md` §1.5/§2.
 */
export type AvailableVoucher = {
  code: string
  description: string
  discount_type: "percentage" | "fixed_amount"
  discount_value: number
  valid_to: string
  min_order: number | null
  applicable_categories: string[]
  /**
   * Only present when `fetchAvailableVouchers` was called with a cart id.
   * Computed server-side (V5 min-order, V6 scope) against that cart's
   * CURRENT contents — never re-derived client-side (SRS: UI must not
   * duplicate voucher business validation).
   */
  eligible?: boolean
  ineligible_reason?: string
  /**
   * Integer VND — the actual discount this cart would receive from this
   * voucher (server-computed via the same pure calculator the real apply
   * flow uses). Also only present with a cart id. The list arrives already
   * sorted by this (eligible first, then highest savings) — this field is
   * for display only, never re-sorted client-side.
   */
  estimated_savings?: number
}

/**
 * API_CONTRACT §4 error envelope (SPEC §8.3) — the one shape every
 * VoucherEngine store-route error response uses, verified against
 * `workflows/voucher-engine/lib/errors.ts`'s `toErrorEnvelope`.
 *
 * SOURCE OF TRUTH: `apps/backend/src/workflows/voucher-engine/lib/errors.ts`
 * (`ErrorEnvelope`). No cross-app type-sharing convention exists in this repo
 * (separate tsconfigs/builds), so this is a manually-mirrored copy — if you
 * change one, check the other for drift.
 */
export type VoucherErrorEnvelope = {
  type:
    | "invalid_data"
    | "not_found"
    | "conflict"
    | "rate_limited"
    | "unauthorized"
    | "not_allowed"
    | "server_error"
  code: string
  message: string
  customer_message: string
  details?: Record<string, unknown>
  request_id?: string
}

/**
 * Result shape returned by `lib/data/voucher.ts` server actions. A discriminated
 * DATA return (not a thrown class instance) deliberately: Next.js only
 * preserves plain return values across the Server Action boundary intact in
 * both dev and production builds — a thrown custom `Error` subclass is
 * flattened to a generic `Error` (message only, no `instanceof`) once it
 * crosses that boundary, which silently breaks any `err.code` branching on
 * the client. `voucherFetch` still `throw`s for genuine transport failures
 * (no cart id, network error) — those are exceptional, not part of the
 * VoucherEngine API contract.
 */
export type VoucherActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: VoucherErrorEnvelope }
