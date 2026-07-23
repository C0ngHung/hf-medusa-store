/**
 * VoucherEngine V1–V8 validators (VOUCH-002, SRS §B.3 lines 271–278).
 *
 * Each validator is a PURE function: (context) → ValidationResult, no I/O, no clock,
 * no Medusa imports. Integer VND math with Math.floor (INT-01). Conditions are quoted
 * from SPEC §B.3; error codes/messages come from the errors.ts catalog.
 */
import { MIN_CODE_LENGTH } from "../../../modules/voucher-engine/constants";
import { fail, PASS } from "./errors";
import { normalizeCode } from "./normalize";
import type {
  CartSnapshot,
  CustomerSegmentSnapshot,
  ValidationResult,
  VoucherSnapshot,
  VoucherValidationContext,
} from "./types";

export { MIN_CODE_LENGTH };

/** Format rule applied AFTER normalizeCode: `MIN_CODE_LENGTH`+ uppercase alphanumerics. */
export const CODE_FORMAT = new RegExp(`^[A-Z0-9]{${MIN_CODE_LENGTH},}$`);

/**
 * 3.2.2 — voucher code format. A malformed manual code has no dedicated customer
 * message in the spec, so it collapses into V1 VOUCHER_NOT_FOUND (same "Mã giảm giá
 * không đúng" message — also avoids leaking which codes are well-formed).
 */
export function validateCodeFormat(
  rawCode: string | null | undefined,
): ValidationResult {
  return CODE_FORMAT.test(normalizeCode(rawCode))
    ? PASS
    : fail("VOUCHER_NOT_FOUND");
}

/** V1 (3.2.4) — voucher exists and is active. */
export function v1Exists(voucher: VoucherSnapshot | null): ValidationResult {
  if (voucher == null) return fail("VOUCHER_NOT_FOUND");
  if (!voucher.is_active) return fail("VOUCHER_INACTIVE");
  return PASS;
}

/** V2 (3.2.5) — now ∈ [valid_from, valid_to] (inclusive bounds). */
export function v2Window(
  voucher: VoucherSnapshot,
  now: Date,
): ValidationResult {
  const t = now.getTime();
  if (t < voucher.valid_from.getTime()) {
    return fail("VOUCHER_NOT_YET_VALID", { valid_from: voucher.valid_from });
  }
  if (t > voucher.valid_to.getTime()) {
    return fail("VOUCHER_EXPIRED", { expired_at: voucher.valid_to });
  }
  return PASS;
}

/** V3 (3.2.6) — global usage_count < usage_limit (null limit ⇒ unlimited). */
export function v3GlobalLimit(voucher: VoucherSnapshot): ValidationResult {
  if (
    voucher.usage_limit != null &&
    voucher.usage_count >= voucher.usage_limit
  ) {
    return fail("VOUCHER_USAGE_LIMIT_REACHED");
  }
  return PASS;
}

/** V4 (3.2.7) — per-user usage < per_user_limit. */
export function v4UserLimit(
  voucher: VoucherSnapshot,
  userUsageCount: number,
): ValidationResult {
  if (userUsageCount >= voucher.per_user_limit) {
    return fail("VOUCHER_PER_USER_LIMIT_REACHED", {
      count: userUsageCount,
      limit: voucher.per_user_limit,
    });
  }
  return PASS;
}

/**
 * V5 (3.2.8) — ORIGINAL (pre-promotion) cart subtotal ≥ min_order_value (decision D3).
 * null min ⇒ no minimum. `remaining` is integer VND still needed to qualify.
 */
export function v5MinOrder(
  voucher: VoucherSnapshot,
  cart: CartSnapshot,
): ValidationResult {
  if (voucher.min_order_value == null) return PASS;
  if (cart.original_subtotal < voucher.min_order_value) {
    return fail("VOUCHER_MIN_ORDER_NOT_MET", {
      remaining: voucher.min_order_value - cart.original_subtotal,
      min_order_value: voucher.min_order_value,
    });
  }
  return PASS;
}

/**
 * V6 (3.2.9) — cart has ≥1 item within scope. Both scope arrays null/empty ⇒ unscoped
 * ⇒ all items eligible (SPEC line 292). Otherwise an item qualifies if its product id is
 * in applicable_product_ids OR any of its categories is in applicable_category_ids.
 */
export function v6Scope(
  voucher: VoucherSnapshot,
  cart: CartSnapshot,
): ValidationResult {
  const productIds = voucher.applicable_product_ids ?? [];
  const categoryIds = voucher.applicable_category_ids ?? [];
  if (productIds.length === 0 && categoryIds.length === 0) return PASS; // unscoped

  const productSet = new Set(productIds);
  const categorySet = new Set(categoryIds);
  const hasEligible = cart.items.some(
    (item) =>
      productSet.has(item.product_id) ||
      item.category_ids.some((cid) => categorySet.has(cid)),
  );
  if (!hasEligible) {
    return fail("VOUCHER_NO_ELIGIBLE_ITEMS", {
      applicable_categories: categoryIds,
    });
  }
  return PASS;
}

/**
 * V7 (3.2.10) — customer segment condition (SPEC Decision J, rebuild-decisions.md
 * Decision 8/9). `user_segment_conditions == null` ⇒ unrestricted, always passes.
 * Otherwise the configured shape is `{ customer_group_ids: string[] }` and the
 * customer must (a) be identified (not a guest) and (b) belong to at least one
 * listed native Medusa Customer Group (`customerSegment.group_ids`, resolved by
 * `lib/customer-segment.ts` — the approved source; this project has no separate
 * CRM/assignment model). A condition object with no usable `customer_group_ids`
 * (missing, not an array, or empty) can never be satisfied by any customer, so
 * it fails closed rather than being treated as unrestricted — there is no
 * existing project convention that reads an empty condition as "no gate".
 */
export function v7Segment(
  voucher: Pick<VoucherSnapshot, "user_segment_conditions">,
  customerSegment: CustomerSegmentSnapshot,
): ValidationResult {
  const conditions = voucher.user_segment_conditions;
  if (conditions == null) return PASS;

  const rawGroupIds = (conditions as { customer_group_ids?: unknown })
    .customer_group_ids;
  const requiredGroupIds = Array.isArray(rawGroupIds) ? rawGroupIds : [];

  if (!customerSegment.customer_id) {
    return fail("VOUCHER_SEGMENT_NOT_ELIGIBLE");
  }

  const isMember = requiredGroupIds.some((groupId) =>
    customerSegment.group_ids.includes(groupId),
  );
  return isMember ? PASS : fail("VOUCHER_SEGMENT_NOT_ELIGIBLE");
}

/**
 * REMOVED (rebuild-decisions.md decision 2, 2026-07-20): there is no V8
 * "non-stackable voucher" check anymore. `stackable_with_promotions` is not
 * configurable — the fixed SRS policy is that automatic item-level
 * Promotions always apply first and the Voucher always applies afterward
 * (see `modules/voucher-engine/lib/calculate-discount.ts`'s calculation
 * order); there is no scenario where a voucher is rejected for coexisting
 * with an item-level promotion. `VOUCHER_STACKING_CONFLICT` is no longer
 * thrown by this chain (kept in the error catalog/type only for schema
 * back-compat — see `lib/errors.ts`).
 */

/** Convenience: the individual rule fns exposed for unit tests. */
export const validators = {
  validateCodeFormat,
  v1Exists,
  v2Window,
  v3GlobalLimit,
  v4UserLimit,
  v5MinOrder,
  v6Scope,
  v7Segment,
} as const;

export type { VoucherValidationContext };
