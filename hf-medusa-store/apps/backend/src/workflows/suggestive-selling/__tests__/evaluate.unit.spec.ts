import {
  buildTier1Candidates,
  applyCategoryBackfill,
  rankAndLimit,
} from "../lib/evaluate";

/**
 * Product-level suggestion evaluation — SRS §10.1 acceptance tests.
 * T-SUGG-01: 3 manual suggestions → all 3 displayed in configured order.
 * T-SUGG-02: 1 manual suggestion → backfilled with 2–4 category complements.
 */
describe("SuggestiveSelling · product-level evaluation (SUGG-001)", () => {
  describe("T-SUGG-01 — product with 3 manual suggestions", () => {
    // display_order deliberately out of order to prove sorting.
    const rules = [
      {
        id: "rule_1",
        tier: "manual",
        items: [
          { suggested_product_id: "p_c", display_order: 2 },
          {
            suggested_product_id: "p_a",
            display_order: 0,
            custom_label: "Best Match",
          },
          { suggested_product_id: "p_b", display_order: 1 },
        ],
      },
    ];

    it("returns all 3, ordered by display_order, preserving custom_label", () => {
      const candidates = buildTier1Candidates(rules, "p_source");
      expect(candidates.map((c) => c.product_id)).toEqual([
        "p_a",
        "p_b",
        "p_c",
      ]);
      expect(candidates[0].custom_label).toBe("Best Match");
      expect(candidates.every((c) => c.tier === "manual")).toBe(true);
    });

    it("rankAndLimit keeps all 3 in order (no truncation under the cap)", () => {
      const ranked = rankAndLimit(buildTier1Candidates(rules, "p_source"));
      expect(ranked.map((c) => c.product_id)).toEqual(["p_a", "p_b", "p_c"]);
    });

    it("excludes the source product if it appears in its own rule", () => {
      const candidates = buildTier1Candidates(rules, "p_a");
      expect(candidates.map((c) => c.product_id)).toEqual(["p_b", "p_c"]);
    });
  });

  describe("T-SUGG-02 — product with 1 manual suggestion → category backfill", () => {
    const rules = [
      {
        id: "rule_1",
        tier: "manual",
        items: [{ suggested_product_id: "p_manual", display_order: 0 }],
      },
    ];

    it("keeps the manual first and backfills category complements up to the limit", () => {
      const tier1 = buildTier1Candidates(rules, "p_source");
      expect(tier1).toHaveLength(1);

      // Complements include a dup of the manual and the source → both excluded.
      const complements = [
        { id: "p_manual" },
        { id: "p_source" },
        { id: "c1" },
        { id: "c2" },
        { id: "c3" },
        { id: "c4" },
        { id: "c5" },
      ];
      const filled = applyCategoryBackfill(tier1, complements, {
        productId: "p_source",
        limit: 5,
      });

      expect(filled).toHaveLength(5); // 1 manual + 4 category
      expect(filled[0]).toMatchObject({
        product_id: "p_manual",
        tier: "manual",
      });
      expect(filled.slice(1).every((c) => c.tier === "category")).toBe(true);
      expect(filled.map((c) => c.product_id)).toEqual([
        "p_manual",
        "c1",
        "c2",
        "c3",
        "c4",
      ]);
    });

    it("backfills 2–4 complements when only a couple are available (SRS: 2–4)", () => {
      const tier1 = buildTier1Candidates(rules, "p_source");
      const filled = applyCategoryBackfill(
        tier1,
        [{ id: "c1" }, { id: "c2" }],
        {
          productId: "p_source",
          limit: 5,
        },
      );
      expect(filled).toHaveLength(3); // 1 + 2
      expect(filled.filter((c) => c.tier === "category")).toHaveLength(2);
    });

    it("does NOT backfill when Tier-1 already has ≥ 3", () => {
      const tier1 = buildTier1Candidates(
        [
          {
            id: "rule_1",
            tier: "manual",
            items: [
              { suggested_product_id: "a", display_order: 0 },
              { suggested_product_id: "b", display_order: 1 },
              { suggested_product_id: "c", display_order: 2 },
            ],
          },
        ],
        "p_source",
      );
      const filled = applyCategoryBackfill(tier1, [{ id: "c1" }], {
        productId: "p_source",
        limit: 5,
      });
      expect(filled).toHaveLength(3);
      expect(filled.every((c) => c.tier === "manual")).toBe(true);
    });
  });

  describe("rankAndLimit — ordering, dedupe, cap", () => {
    it("orders manual before category, de-dupes by product, caps at limit", () => {
      const candidates = [
        {
          product_id: "cat1",
          tier: "category",
          rule_id: null,
          display_order: 0,
          custom_label: null,
          source: "tier2",
        },
        {
          product_id: "man1",
          tier: "manual",
          rule_id: "r",
          display_order: 1,
          custom_label: null,
          source: "tier1",
        },
        {
          product_id: "man1",
          tier: "manual",
          rule_id: "r",
          display_order: 1,
          custom_label: null,
          source: "tier1",
        },
      ] as any;
      expect(rankAndLimit(candidates, 5).map((c) => c.product_id)).toEqual([
        "man1",
        "cat1",
      ]);
    });

    it("caps to the limit", () => {
      const candidates = Array.from({ length: 8 }, (_, i) => ({
        product_id: `p${i}`,
        tier: "manual",
        rule_id: "r",
        display_order: i,
        custom_label: null,
        source: "tier1",
      })) as any;
      expect(rankAndLimit(candidates, 5)).toHaveLength(5);
    });
  });
});
