import { computeSalesRanking } from "../compute-sales-ranking";

describe("computeSalesRanking (Tier-2 top-seller aggregation, SPEC A.6)", () => {
  const productCategories = new Map<string, string[]>([
    ["p_string", ["cat_strings"]],
    ["p_grip", ["cat_grips"]],
    ["p_multi", ["cat_strings", "cat_grips"]], // product in two categories
  ]);

  it("sums quantities per product across orders and fans out to categories", () => {
    const orders = [
      {
        items: [
          { product_id: "p_string", quantity: 2 },
          { product_id: "p_grip", quantity: 1 },
        ],
      },
      { items: [{ product_id: "p_string", quantity: 3 }] },
    ];
    const rows = computeSalesRanking(orders, productCategories);
    const string = rows.find((r) => r.product_id === "p_string");
    const grip = rows.find((r) => r.product_id === "p_grip");
    expect(string).toMatchObject({
      category_id: "cat_strings",
      sales_count: 5,
    });
    expect(grip).toMatchObject({ category_id: "cat_grips", sales_count: 1 });
  });

  it("emits one row per category for multi-category products", () => {
    const orders = [{ items: [{ product_id: "p_multi", quantity: 4 }] }];
    const rows = computeSalesRanking(orders, productCategories);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.category_id).sort()).toEqual([
      "cat_grips",
      "cat_strings",
    ]);
    expect(rows.every((r) => r.sales_count === 4)).toBe(true);
  });

  it("drops products with no categories or zero sales, and ignores null product_id", () => {
    const orders = [
      { items: [{ product_id: "p_unknown", quantity: 9 }] }, // not in map → no category rows
      { items: [{ product_id: "p_string", quantity: 0 }] }, // zero sales → dropped
      { items: [{ product_id: null, quantity: 5 }] }, // null id → ignored
    ];
    expect(computeSalesRanking(orders, productCategories)).toHaveLength(0);
  });

  it("handles empty input", () => {
    expect(computeSalesRanking([], productCategories)).toEqual([]);
    expect(computeSalesRanking(undefined as any, productCategories)).toEqual(
      [],
    );
  });
});
