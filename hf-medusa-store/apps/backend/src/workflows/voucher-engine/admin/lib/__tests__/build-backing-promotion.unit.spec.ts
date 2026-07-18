import { buildBackingPromotion } from "../build-backing-promotion";
import type { CreateVoucherStepInput } from "../../steps/create-voucher";

const base: CreateVoucherStepInput = {
  discount_type: "percentage",
  discount_value: 2000, // 20.00%
  valid_from: new Date("2026-01-01T00:00:00Z"),
  valid_to: new Date("2026-12-31T23:59:59Z"),
  per_user_limit: 1,
};

function build(overrides: Partial<CreateVoucherStepInput>, code = "CODE123") {
  return buildBackingPromotion({ ...base, ...overrides }, code)[0];
}

describe("buildBackingPromotion (Decision H / Phase 2 backing promotion)", () => {
  it("converts a basis-points percentage to a Medusa percent value (2000 -> 20)", () => {
    const p = build({ discount_type: "percentage", discount_value: 2000 });
    expect(p.application_method.type).toBe("percentage");
    expect(p.application_method.value).toBe(20);
    expect(p.application_method.target_type).toBe("items");
    expect(p.application_method.allocation).toBe("across");
    expect(p.code).toBe("CODE123");
    expect(p.type).toBe("standard");
    expect(p.is_automatic).toBe(false);
  });

  it("uses a fixed_amount value verbatim as raw VND", () => {
    const p = build({ discount_type: "fixed_amount", discount_value: 50_000 });
    expect(p.application_method.type).toBe("fixed");
    expect(p.application_method.value).toBe(50_000);
  });

  it("maps V3 usage_limit to Promotion.limit; omits it when null", () => {
    expect(build({ usage_limit: 100 }).limit).toBe(100);
    expect(build({ usage_limit: null }).limit).toBeUndefined();
  });

  it("maps V5 min_order_value to an item_total gte rule; omits rules when null", () => {
    const withMin = build({ min_order_value: 500_000 });
    expect(withMin.rules).toEqual([
      { attribute: "item_total", operator: "gte", values: ["500000"] },
    ]);
    expect(build({ min_order_value: null }).rules).toBeUndefined();
  });

  it("V6 product-only scope -> items.product.id target_rule", () => {
    const p = build({ applicable_product_ids: ["prod_1", "prod_2"] });
    expect(p.application_method.target_rules).toEqual([
      {
        attribute: "items.product.id",
        operator: "in",
        values: ["prod_1", "prod_2"],
      },
    ]);
  });

  it("V6 category-only scope -> items.product.categories.id target_rule", () => {
    const p = build({ applicable_category_ids: ["cat_1"] });
    expect(p.application_method.target_rules).toEqual([
      {
        attribute: "items.product.categories.id",
        operator: "in",
        values: ["cat_1"],
      },
    ]);
  });

  it("V6 MIXED product+category scope -> NO native target_rules (cross-attribute OR not expressible)", () => {
    const p = build({
      applicable_product_ids: ["prod_1"],
      applicable_category_ids: ["cat_1"],
    });
    expect(p.application_method.target_rules).toBeUndefined();
  });

  it("provisions the Campaign window + V4 per-customer use_by_attribute budget", () => {
    const p = build({ per_user_limit: 3 });
    expect(p.campaign?.campaign_identifier).toBe("voucher-CODE123");
    expect(p.campaign?.starts_at).toEqual(base.valid_from);
    expect(p.campaign?.ends_at).toEqual(base.valid_to);
    expect(p.campaign?.budget).toEqual({
      type: "use_by_attribute",
      attribute: "customer_id",
      limit: 3,
    });
  });

  it("reflects is_active=false as an inactive Promotion status", () => {
    expect(build({ is_active: false }).status).toBe("inactive");
    expect(build({ is_active: true }).status).toBe("active");
  });

  it("stamps voucher_engine metadata for guardrail + identification", () => {
    const promo = build({}, "SAVE10");
    expect(promo.metadata).toEqual({
      voucher_engine: true,
      voucher_code: "SAVE10",
    });
  });
});
