import { CR02_DEFAULT_BADGE, FREE_SHIPPING_THRESHOLD } from "../constants";
import {
  cr02Band,
  cr02Fires,
  matchesCartCondition,
  matchesCartRule,
  mergeDedupeCart,
  type CartRuleCondition,
  type CartRuleContext,
  type CollectedCartCandidate,
} from "../evaluator/cart-rules";
import type { EnrichedProduct } from "../types";

/**
 * Unit tests for the pure cart-rule logic (SPEC A.6 / SUGG-004 — T-SUGG-07/08).
 * No Medusa runtime: exercises only the deterministic firing/assembly functions.
 */

function context(overrides: Partial<CartRuleContext> = {}): CartRuleContext {
  return {
    subtotal: 0,
    // Engine resolves this from the shipping price rule at runtime; tests pin it
    // to the fallback so CR-02 firing math matches the D5 fixtures.
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
    categoryIds: [],
    brands: [],
    lines: [],
    ...overrides,
  };
}

function product(overrides: Partial<EnrichedProduct> = {}): EnrichedProduct {
  return {
    product_id: "prod_x",
    handle: "handle-x",
    name: "Product X",
    image_url: "https://img/x.jpg",
    status: "published",
    category_ids: [],
    category_names: [],
    brand: null,
    variant_id: "var_x",
    requires_variant_selection: false,
    in_stock: true,
    price: 100000,
    discount_price: null,
    ...overrides,
  };
}

describe("cr02Fires — D5 (within 15% of threshold)", () => {
  const t = 7_000_000;
  it("fires at the lower edge threshold×0.85", () => {
    expect(cr02Fires(5_950_000, t, 0.15)).toBe(true);
  });
  it("fires just below the threshold", () => {
    expect(cr02Fires(6_999_999, t, 0.15)).toBe(true);
  });
  it("does not fire at/above the threshold", () => {
    expect(cr02Fires(7_000_000, t, 0.15)).toBe(false);
  });
  it("does not fire below the band", () => {
    expect(cr02Fires(5_949_999, t, 0.15)).toBe(false);
  });
  it("never fires for a non-positive threshold", () => {
    expect(cr02Fires(100, 0, 0.15)).toBe(false);
  });
});

describe("cr02Band — D4 (remaining ≤ price ≤ remaining×2)", () => {
  it("bands from remaining to remaining×2 by default", () => {
    expect(cr02Band(300_000)).toEqual({ min: 300_000, max: 600_000 });
  });
  it("honours a custom multiplier", () => {
    expect(cr02Band(300_000, 3)).toEqual({ min: 300_000, max: 900_000 });
  });
});

describe("matchesCartCondition", () => {
  it("CR-01 category_missing fires when a watched source category is in the cart (2.4.2)", () => {
    const cond: CartRuleCondition = {
      condition_type: "category_missing",
      condition_params: { source_category_ids: ["cat_racket"] },
    };
    expect(
      matchesCartCondition(cond, context({ categoryIds: ["cat_racket"] })),
    ).toBe(true);
    expect(
      matchesCartCondition(cond, context({ categoryIds: ["cat_shoe"] })),
    ).toBe(false);
  });

  it("CR-01 does not fire without configured source categories", () => {
    const cond: CartRuleCondition = {
      condition_type: "category_missing",
      condition_params: {},
    };
    expect(
      matchesCartCondition(cond, context({ categoryIds: ["cat_racket"] })),
    ).toBe(false);
  });

  it("CR-02 threshold_near fires inside the band and rejects invalid pct (2.4.3)", () => {
    const near = context({ subtotal: FREE_SHIPPING_THRESHOLD - 300_000 });
    expect(
      matchesCartCondition(
        {
          condition_type: "threshold_near",
          condition_params: { percentage: 0.15 },
        },
        near,
      ),
    ).toBe(true);
    expect(
      matchesCartCondition(
        {
          condition_type: "threshold_near",
          condition_params: { percentage: 2 },
        },
        near,
      ),
    ).toBe(false);
    expect(
      matchesCartCondition(
        { condition_type: "threshold_near", condition_params: {} },
        near,
      ),
    ).toBe(false);
  });

  it("CR-03 brand_match fires only when exactly one distinct brand is present (2.4.5)", () => {
    const cond: CartRuleCondition = { condition_type: "brand_match" };
    expect(matchesCartCondition(cond, context({ brands: ["Yonex"] }))).toBe(
      true,
    );
    expect(
      matchesCartCondition(cond, context({ brands: ["Yonex", "Li-Ning"] })),
    ).toBe(false);
    expect(matchesCartCondition(cond, context({ brands: [] }))).toBe(false);
  });

  it("CR-04 consumable_upsell fires for a low-qty line in scope (2.4.6)", () => {
    const cond: CartRuleCondition = {
      condition_type: "consumable_upsell",
      condition_params: {
        consumable_category_ids: ["cat_string"],
        max_quantity: 1,
      },
    };
    const inScope = context({
      lines: [{ quantity: 1, categoryIds: ["cat_string"], categoryNames: [] }],
    });
    const qtyTooHigh = context({
      lines: [{ quantity: 2, categoryIds: ["cat_string"], categoryNames: [] }],
    });
    const outOfScope = context({
      lines: [{ quantity: 1, categoryIds: ["cat_shoe"], categoryNames: [] }],
    });
    expect(matchesCartCondition(cond, inScope)).toBe(true);
    expect(matchesCartCondition(cond, qtyTooHigh)).toBe(false);
    expect(matchesCartCondition(cond, outOfScope)).toBe(false);
  });

  it("CR-04 without a category scope accepts any low-qty line", () => {
    const cond: CartRuleCondition = {
      condition_type: "consumable_upsell",
      condition_params: { max_quantity: 1 },
    };
    const ctx = context({
      lines: [
        { quantity: 1, categoryIds: ["cat_anything"], categoryNames: [] },
      ],
    });
    expect(matchesCartCondition(cond, ctx)).toBe(true);
  });
});

describe("matchesCartRule — AND semantics (2.4.7)", () => {
  it("fires only when every condition matches", () => {
    const conds: CartRuleCondition[] = [
      { condition_type: "brand_match" },
      {
        condition_type: "category_missing",
        condition_params: { source_category_ids: ["cat_racket"] },
      },
    ];
    const both = context({ brands: ["Yonex"], categoryIds: ["cat_racket"] });
    const onlyBrand = context({ brands: ["Yonex"], categoryIds: ["cat_shoe"] });
    expect(matchesCartRule(conds, both)).toBe(true);
    expect(matchesCartRule(conds, onlyBrand)).toBe(false);
  });

  it("an empty rule never fires", () => {
    expect(matchesCartRule([], context({ brands: ["Yonex"] }))).toBe(false);
  });
});

describe("mergeDedupeCart — 2.4.8 / BR-04", () => {
  it("projects to the wire shape with tier=cart and rule_id=null", () => {
    const collected: CollectedCartCandidate[] = [
      {
        product: product({ product_id: "p1" }),
        code: "CR-02",
        badge: "Add for FREE shipping!",
      },
    ];
    const [s] = mergeDedupeCart(collected, 3);
    expect(s).toMatchObject({
      product_id: "p1",
      tier: "cart",
      rule_id: null,
      rule_code: "CR-02",
      badge_text: "Add for FREE shipping!",
    });
  });

  it("dedupes by product keeping the FIRST rule's code and badge (BR-04)", () => {
    const collected: CollectedCartCandidate[] = [
      { product: product({ product_id: "dup" }), code: "CR-01", badge: null },
      {
        product: product({ product_id: "dup" }),
        code: "CR-02",
        badge: CR02_DEFAULT_BADGE,
      },
    ];
    const result = mergeDedupeCart(collected, 3);
    expect(result).toHaveLength(1);
    expect(result[0].rule_code).toBe("CR-01");
    expect(result[0].badge_text).toBeNull();
  });

  it("caps at the limit (default CART_LIMIT = 3)", () => {
    const collected: CollectedCartCandidate[] = Array.from(
      { length: 5 },
      (_, i) => ({
        product: product({ product_id: `p${i}` }),
        code: "CR-01" as const,
        badge: null,
      }),
    );
    expect(mergeDedupeCart(collected)).toHaveLength(3);
  });

  it("preserves fire order across rules", () => {
    const collected: CollectedCartCandidate[] = [
      { product: product({ product_id: "a" }), code: "CR-01", badge: null },
      {
        product: product({ product_id: "b" }),
        code: "CR-02",
        badge: CR02_DEFAULT_BADGE,
      },
    ];
    expect(mergeDedupeCart(collected).map((s) => s.product_id)).toEqual([
      "a",
      "b",
    ]);
  });
});
