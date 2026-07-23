/**
 * revalidateVoucherOnCartChange — cart-change validation SUBSET unit tests
 * (SPEC §9.2; tasks 3.5.1, 3.5.7, 3.5.8). Pins the most safety-critical
 * business rule of this subset: V3 (global usage) and V4 (per-user usage)
 * must NEVER trigger auto-removal of an already-applied voucher — usage is
 * consumed only at redemption (Rule 12/13), so a global/per-user counter
 * moving elsewhere must not punish a customer mid-checkout (EC-06).
 */
import { revalidateVoucherOnCartChange } from "../lib/revalidate-voucher";
import type { CartSnapshot, VoucherSnapshot } from "../lib/types";

const baseVoucher: VoucherSnapshot = {
  code: "SAVE10",
  is_active: true,
  valid_from: new Date("2020-01-01T00:00:00Z"),
  valid_to: new Date("2999-01-01T00:00:00Z"),
  usage_limit: 1,
  usage_count: 1, // already AT the global limit
  per_user_limit: 1,
  min_order_value: 100_000,
  applicable_product_ids: null,
  applicable_category_ids: null,
  user_segment_conditions: null,
};

const baseCart: CartSnapshot = {
  original_subtotal: 200_000,
  items: [
    {
      product_id: "prod_1",
      category_ids: [],
      quantity: 1,
      unit_price: 200_000,
    },
  ],
  has_item_promotion: false,
};

describe("revalidateVoucherOnCartChange (task 3.5.1/3.5.7/3.5.8, SPEC §9.2)", () => {
  it("passes even when the GLOBAL usage_count is already at/over usage_limit (V3 skipped)", () => {
    const result = revalidateVoucherOnCartChange({
      voucher: baseVoucher, // usage_count(1) >= usage_limit(1) — would fail V3 if it ran
      now: new Date("2026-01-01T00:00:00Z"),
      cart: baseCart,
      user_usage_count: 5, // would fail V4 too if it ran
    });
    expect(result.ok).toBe(true);
  });

  it("passes regardless of user_usage_count vs per_user_limit (V4 skipped)", () => {
    const result = revalidateVoucherOnCartChange({
      voucher: { ...baseVoucher, usage_limit: null, usage_count: 0 },
      now: new Date("2026-01-01T00:00:00Z"),
      cart: baseCart,
      user_usage_count: 999,
    });
    expect(result.ok).toBe(true);
  });

  it("still fails V1 when the voucher has been deactivated since apply", () => {
    const result = revalidateVoucherOnCartChange({
      voucher: { ...baseVoucher, is_active: false },
      now: new Date("2026-01-01T00:00:00Z"),
      cart: baseCart,
      user_usage_count: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VOUCHER_INACTIVE");
  });

  it("still fails V2 when the voucher has expired since apply", () => {
    const result = revalidateVoucherOnCartChange({
      voucher: { ...baseVoucher, valid_to: new Date("2020-01-02T00:00:00Z") },
      now: new Date("2026-01-01T00:00:00Z"),
      cart: baseCart,
      user_usage_count: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VOUCHER_EXPIRED");
  });

  it("still fails V5 when the cart drops below min_order_value (auto-remove trigger, task 3.5.7)", () => {
    const result = revalidateVoucherOnCartChange({
      voucher: baseVoucher,
      now: new Date("2026-01-01T00:00:00Z"),
      cart: { ...baseCart, original_subtotal: 50_000 },
      user_usage_count: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VOUCHER_MIN_ORDER_NOT_MET");
  });

  it("still fails V6 when no cart item matches a scoped voucher (auto-remove trigger, task 3.5.8)", () => {
    const result = revalidateVoucherOnCartChange({
      voucher: {
        ...baseVoucher,
        min_order_value: null,
        applicable_category_ids: ["cat_strings"],
      },
      now: new Date("2026-01-01T00:00:00Z"),
      cart: {
        original_subtotal: 200_000,
        items: [
          {
            product_id: "prod_other",
            category_ids: ["cat_shoes"],
            quantity: 1,
            unit_price: 200_000,
          },
        ],
        has_item_promotion: false,
      },
      user_usage_count: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VOUCHER_NO_ELIGIBLE_ITEMS");
  });

  // V8 (stacking-conflict) was removed along with `stackable_with_promotions`
  // (rebuild-decisions.md decision 2, 2026-07-20) — an automatic item-level
  // Promotion coexisting with the Voucher is always allowed now, so a
  // cart-change revalidation can never be auto-removed for "stacking".

  it("fails V1 NOT_FOUND when the voucher is null (defensive — should not normally reach this subset)", () => {
    const result = revalidateVoucherOnCartChange({
      voucher: null,
      now: new Date("2026-01-01T00:00:00Z"),
      cart: baseCart,
      user_usage_count: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("VOUCHER_NOT_FOUND");
  });
});
