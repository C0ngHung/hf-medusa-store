import { hydrateVoucherFromPromotion } from "../hydrate-voucher-from-promotion";

const baseConfig: any = {
  id: "vc_1",
  code: "OLD",
  discount_type: "percentage",
  discount_value: 1000,
  is_active: false,
  valid_from: new Date("2000-01-01"),
  valid_to: new Date("2000-01-02"),
  usage_limit: null,
  usage_count: 3,
  per_user_limit: 1,
  min_order_value: 200000,
  max_discount_amount: 500000,
  applicable_product_ids: ["p1"],
  applicable_category_ids: null,
  stackable_with_promotions: true,
  user_segment_conditions: null,
  promotion_id: "promo_1",
};

const promo: any = {
  code: "SAVE25",
  status: "active",
  application_method: { type: "percentage", value: 25 },
  limit: 100,
  campaign: {
    starts_at: new Date("2026-01-01"),
    ends_at: new Date("2026-12-31"),
  },
};

it("overlays code, discount, status, window, limit from promotion (percent→bps)", () => {
  const r = hydrateVoucherFromPromotion(baseConfig, promo);
  expect(r.code).toBe("SAVE25");
  expect(r.discount_type).toBe("percentage");
  expect(r.discount_value).toBe(2500); // 25 percent → 2500 bps
  expect(r.is_active).toBe(true); // from promotion.status
  expect(r.valid_from).toEqual(new Date("2026-01-01"));
  expect(r.valid_to).toEqual(new Date("2026-12-31"));
  expect(r.usage_limit).toBe(100);
});

it("keeps voucher-only fields from config untouched", () => {
  const r = hydrateVoucherFromPromotion(baseConfig, promo);
  expect(r.max_discount_amount).toBe(500000);
  expect(r.min_order_value).toBe(200000);
  expect(r.per_user_limit).toBe(1);
  expect(r.usage_count).toBe(3); // counter stays config-owned
  expect(r.applicable_product_ids).toEqual(["p1"]);
});

it("fixed_amount: value passes through without ×100", () => {
  const r = hydrateVoucherFromPromotion(baseConfig, {
    ...promo,
    application_method: { type: "fixed", value: 50000 },
  });
  expect(r.discount_type).toBe("fixed_amount");
  expect(r.discount_value).toBe(50000);
});

it("no promotion → returns config unchanged (defensive)", () => {
  const r = hydrateVoucherFromPromotion(baseConfig, null);
  expect(r).toBe(baseConfig);
});
