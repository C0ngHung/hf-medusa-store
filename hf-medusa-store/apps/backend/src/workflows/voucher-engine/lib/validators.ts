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
 * V7 (3.2.10) — customer segment condition. STUB: the "approved source" / segment schema
 * is an open SRS issue (CRM integration undefined), so Day 3 is a pass-through. The code
 * VOUCHER_SEGMENT_NOT_ELIGIBLE and its message stay in the catalog for the future gate.
 */
export function v7Segment(_voucher: VoucherSnapshot): ValidationResult {
  return PASS;
}

/** V8 (3.2.11) — non-stackable voucher conflicts with an existing item-level promotion. */
export function v8Stacking(
  voucher: VoucherSnapshot,
  cart: CartSnapshot,
): ValidationResult {
  if (!voucher.stackable_with_promotions && cart.has_item_promotion) {
    return fail("VOUCHER_STACKING_CONFLICT");
  }
  return PASS;
}

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
  v8Stacking,
} as const;

export type { VoucherValidationContext };
