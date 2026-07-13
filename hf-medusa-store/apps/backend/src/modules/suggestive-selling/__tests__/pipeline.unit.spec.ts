import { CONSUMABLE_CATEGORIES } from "../constants";
import {
  applyBr02Filter,
  computePriceFields,
  finalizeSuggestions,
  isConsumable,
  rankAndLimit,
  resolveVariant,
  toProductSuggestion,
} from "../evaluator/pipeline";
import type { EnrichedCandidate, FilterContext, VariantLike } from "../types";

/**
 * Unit tests for the pure evaluation pipeline (SPEC A.12 — T-SUGG-01..05).
 * No Medusa runtime: exercises only the deterministic business-rule functions.
 */

function candidate(
  overrides: Partial<EnrichedCandidate> = {},
): EnrichedCandidate {
  return {
    product_id: "prod_x",
    tier: "manual",
    rule_id: "srule_1",
    display_order: 0,
    custom_label: null,
    handle: "handle-x",
    name: "Product X",
    image_url: "https://img/x.jpg",
    status: "published",
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

function filterCtx(overrides: Partial<FilterContext> = {}): FilterContext {
  return {
    sourceProductId: null,
    cartProductIds: new Set(),
    dismissedProductIds: new Set(),
    recentlyPurchasedProductIds: new Set(),
    consumableCategories: new Set(CONSUMABLE_CATEGORIES),
    ...overrides,
  };
}

describe("rankAndLimit — BR-01 (T-SUGG-01)", () => {
  it("keeps three manual suggestions in display_order", () => {
    const input = [
      candidate({ product_id: "p2", display_order: 2 }),
      candidate({ product_id: "p1", display_order: 1 }),
      candidate({ product_id: "p3", display_order: 3 }),
    ];
    const ranked = rankAndLimit(input, 5);
    expect(ranked.map((c) => c.product_id)).toEqual(["p1", "p2", "p3"]);
  });

  it("orders Tier-1 manual ahead of Tier-2 category regardless of display_order", () => {
    const input = [
      candidate({ product_id: "cat1", tier: "category", display_order: 0 }),
      candidate({ product_id: "man1", tier: "manual", display_order: 9 }),
    ];
    const ranked = rankAndLimit(input, 5);
    expect(ranked.map((c) => c.product_id)).toEqual(["man1", "cat1"]);
  });

  it("dedupes by product_id keeping the highest-priority slot", () => {
    const input = [
      candidate({ product_id: "dup", tier: "category", display_order: 0 }),
      candidate({
        product_id: "dup",
        tier: "manual",
        display_order: 5,
        custom_label: "Best Match",
      }),
    ];
    const ranked = rankAndLimit(input, 5);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].tier).toBe("manual");
    expect(ranked[0].custom_label).toBe("Best Match");
  });

  it("caps at the requested limit", () => {
    const input = Array.from({ length: 8 }, (_, i) =>
      candidate({ product_id: `p${i}`, display_order: i }),
    );
    expect(rankAndLimit(input, 5)).toHaveLength(5);
  });
});

describe("backfill interleaves with the filter — SUGG-002 / SPEC A.5 (regression)", () => {
  // The exact reported scenario: 3 curated (manual) items, 2 out of stock. The
  // dropped slots MUST be refilled from Tier-2 that lives in the same buffer.
  it("refills out-of-stock manual slots from Tier-2 up to the limit", () => {
    const buffer = [
      candidate({
        product_id: "man_ok",
        tier: "manual",
        display_order: 1,
        in_stock: true,
      }),
      candidate({
        product_id: "man_oos1",
        tier: "manual",
        display_order: 2,
        in_stock: false,
      }),
      candidate({
        product_id: "man_oos2",
        tier: "manual",
        display_order: 3,
        in_stock: false,
      }),
      candidate({
        product_id: "cat_a",
        tier: "category",
        display_order: 0,
        in_stock: true,
      }),
      candidate({
        product_id: "cat_b",
        tier: "category",
        display_order: 1,
        in_stock: true,
      }),
      candidate({
        product_id: "cat_c",
        tier: "category",
        display_order: 2,
        in_stock: true,
      }),
    ];
    const result = finalizeSuggestions(buffer, filterCtx(), 3);
    // 1 surviving manual first, then Tier-2 fills the 2 emptied slots — 3 shown, not 1.
    expect(result.map((s) => s.product_id)).toEqual([
      "man_ok",
      "cat_a",
      "cat_b",
    ]);
    expect(result.map((s) => s.tier)).toEqual([
      "manual",
      "category",
      "category",
    ]);
  });

  it("keeps only Tier-1 when all curated items survive (Tier-2 stays hidden)", () => {
    const buffer = [
      candidate({ product_id: "m1", tier: "manual", display_order: 1 }),
      candidate({ product_id: "m2", tier: "manual", display_order: 2 }),
      candidate({ product_id: "m3", tier: "manual", display_order: 3 }),
      candidate({ product_id: "cat_a", tier: "category", display_order: 0 }),
    ];
    const result = finalizeSuggestions(buffer, filterCtx(), 3);
    expect(result.map((s) => s.product_id)).toEqual(["m1", "m2", "m3"]);
  });
});

describe("applyBr02Filter — SUGG-002 (T-SUGG-03/04/05)", () => {
  it("drops a product already in the cart (a)", () => {
    const { kept, dropped } = applyBr02Filter(
      [candidate({ product_id: "in_cart" })],
      filterCtx({ cartProductIds: new Set(["in_cart"]) }),
    );
    expect(kept).toHaveLength(0);
    expect(dropped[0]).toEqual({ product_id: "in_cart", reason: "in_cart" });
  });

  it("drops an out-of-stock product (b)", () => {
    const { kept, dropped } = applyBr02Filter(
      [candidate({ in_stock: false })],
      filterCtx(),
    );
    expect(kept).toHaveLength(0);
    expect(dropped[0].reason).toBe("out_of_stock");
  });

  it("drops a dismissed product (c)", () => {
    const { kept, dropped } = applyBr02Filter(
      [candidate({ product_id: "x" })],
      filterCtx({ dismissedProductIds: new Set(["x"]) }),
    );
    expect(kept).toHaveLength(0);
    expect(dropped[0].reason).toBe("dismissed");
  });

  it("drops a recently-bought durable but keeps a recently-bought consumable (d)", () => {
    const durable = candidate({
      product_id: "racket",
      category_names: ["Rackets"],
    });
    const consumable = candidate({
      product_id: "string",
      category_names: ["Strings"],
    });
    const ctx = filterCtx({
      recentlyPurchasedProductIds: new Set(["racket", "string"]),
    });

    const { kept } = applyBr02Filter([durable, consumable], ctx);
    expect(kept.map((c) => c.product_id)).toEqual(["string"]);
  });

  it("drops the source product itself (e)", () => {
    const { dropped } = applyBr02Filter(
      [candidate({ product_id: "self" })],
      filterCtx({ sourceProductId: "self" }),
    );
    expect(dropped[0].reason).toBe("self");
  });

  it("drops an unpublished product (f)", () => {
    const { dropped } = applyBr02Filter(
      [candidate({ status: "draft" })],
      filterCtx(),
    );
    expect(dropped[0].reason).toBe("inactive");
  });

  it("keeps a clean candidate", () => {
    const { kept } = applyBr02Filter(
      [candidate({ product_id: "ok" })],
      filterCtx(),
    );
    expect(kept.map((c) => c.product_id)).toEqual(["ok"]);
  });
});

describe("isConsumable — BR-02(d)", () => {
  it("matches case-insensitively", () => {
    const set = new Set(CONSUMABLE_CATEGORIES);
    expect(isConsumable(["strings"], set)).toBe(true);
    expect(isConsumable(["Rackets"], set)).toBe(false);
  });
});

describe("resolveVariant — SUGG-003", () => {
  it("auto-selects a single variant", () => {
    expect(resolveVariant([{ id: "v1" }])).toEqual({
      variant_id: "v1",
      requires_variant_selection: false,
    });
  });

  it("requires selection when there are multiple variants", () => {
    expect(resolveVariant([{ id: "v1" }, { id: "v2" }])).toEqual({
      variant_id: null,
      requires_variant_selection: true,
    });
  });

  it("handles a product with no variants", () => {
    expect(resolveVariant([])).toEqual({
      variant_id: null,
      requires_variant_selection: false,
    });
  });
});

describe("computePriceFields — API Contract §1.1 / INT-01", () => {
  it("returns null discount_price when there is no item promotion", () => {
    const variants: VariantLike[] = [
      {
        id: "v1",
        calculated_price: {
          calculated_amount: 150000,
          original_amount: 150000,
        },
      },
    ];
    expect(computePriceFields(variants)).toEqual({
      price: 150000,
      discount_price: null,
    });
  });

  it("exposes discount_price when calculated < original", () => {
    const variants: VariantLike[] = [
      {
        id: "v1",
        calculated_price: {
          calculated_amount: 105000,
          original_amount: 150000,
        },
      },
    ];
    expect(computePriceFields(variants)).toEqual({
      price: 150000,
      discount_price: 105000,
    });
  });

  it('uses the cheapest variant as the "from" price', () => {
    const variants: VariantLike[] = [
      {
        id: "v1",
        calculated_price: {
          calculated_amount: 200000,
          original_amount: 200000,
        },
      },
      {
        id: "v2",
        calculated_price: {
          calculated_amount: 150000,
          original_amount: 150000,
        },
      },
    ];
    expect(computePriceFields(variants).price).toBe(150000);
  });

  it("floors fractional amounts to integer VND (D1)", () => {
    const variants: VariantLike[] = [
      {
        id: "v1",
        calculated_price: {
          calculated_amount: 99999.9,
          original_amount: 149999.9,
        },
      },
    ];
    expect(computePriceFields(variants)).toEqual({
      price: 149999,
      discount_price: 99999,
    });
  });

  it("returns nulls when no variant is priced", () => {
    expect(computePriceFields([{ id: "v1" }])).toEqual({
      price: null,
      discount_price: null,
    });
  });
});

describe("toProductSuggestion / finalizeSuggestions — task 4 response shape", () => {
  it("projects the mandated display fields and 1-based display_order", () => {
    const s = toProductSuggestion(
      candidate({ custom_label: "Best Match", discount_price: 90000 }),
      1,
    );
    expect(s).toMatchObject({
      image_url: "https://img/x.jpg",
      name: "Product X",
      price: 100000,
      discount_price: 90000,
      label: "Best Match",
      display_order: 1,
    });
  });

  it("runs filter → rank → limit → project end to end", () => {
    const candidates = [
      candidate({ product_id: "in_cart" }),
      candidate({ product_id: "keep2", tier: "category", display_order: 0 }),
      candidate({
        product_id: "keep1",
        tier: "manual",
        display_order: 1,
        custom_label: "Top",
      }),
    ];
    const result = finalizeSuggestions(
      candidates,
      filterCtx({ cartProductIds: new Set(["in_cart"]) }),
      5,
    );
    expect(result.map((s) => s.product_id)).toEqual(["keep1", "keep2"]);
    expect(result.map((s) => s.display_order)).toEqual([1, 2]);
    expect(result[0].label).toBe("Top");
  });
});
