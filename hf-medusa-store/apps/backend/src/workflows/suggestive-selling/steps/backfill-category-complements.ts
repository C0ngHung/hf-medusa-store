import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";
import { SUGGESTIVE_SELLING_MODULE } from "../../../modules/suggestive-selling";
import {
  PRODUCT_LIMIT,
  TIER1_MIN_SURVIVORS,
} from "../../../modules/suggestive-selling/constants";
import type { SuggestionCandidate } from "../types";

/**
 * Step 3 (SRS SUGG-001 Tier 2) — if Tier-1 yields fewer than TIER1_MIN_SURVIVORS,
 * backfill from the source product's complementary categories up to the limit.
 * Read-only → no compensation.
 *
 * NOTE (SPEC A.6): "top-seller (30d)" needs Order aggregation; Phase-1 falls back
 * to newest-first. TODO: rank by 30-day sales once the Order aggregate is wired.
 */
export const backfillCategoryComplementsStep = createStep(
  "backfill-category-complements",
  async (
    input: {
      candidates: SuggestionCandidate[];
      productId: string;
      limit?: number;
    },
    { container },
  ) => {
    const limit = input.limit ?? PRODUCT_LIMIT;
    const candidates = [...(input.candidates ?? [])];

    if (candidates.length >= TIER1_MIN_SURVIVORS) {
      return new StepResponse(candidates);
    }
    const need = limit - candidates.length;
    if (need <= 0) return new StepResponse(candidates);

    const suggestive: any = container.resolve(SUGGESTIVE_SELLING_MODULE);
    const productService: any = container.resolve(Modules.PRODUCT);

    // Source product's categories → ordered, de-duplicated complement categories.
    const product = await productService.retrieveProduct(input.productId, {
      relations: ["categories"],
    });
    const sourceCatIds: string[] = (product?.categories ?? []).map(
      (c: any) => c.id,
    );

    const complementCatIds: string[] = [];
    for (const catId of sourceCatIds) {
      const maps = await suggestive.listComplements(catId);
      for (const m of maps) {
        if (!complementCatIds.includes(m.complement_category_id)) {
          complementCatIds.push(m.complement_category_id);
        }
      }
    }
    if (!complementCatIds.length) return new StepResponse(candidates);

    const exclude = new Set<string>([
      input.productId,
      ...candidates.map((c) => c.product_id),
    ]);

    // Fetch a few extra to absorb excluded ids, then take what we need.
    const products = await productService.listProducts(
      { categories: { id: complementCatIds }, status: "published" },
      { order: { created_at: "DESC" }, take: need + exclude.size },
    );

    for (const p of products) {
      if (candidates.length >= limit) break;
      if (exclude.has(p.id)) continue;
      exclude.add(p.id);
      candidates.push({
        product_id: p.id,
        tier: "category",
        rule_id: null,
        display_order: candidates.length,
        custom_label: null,
        source: "tier2",
      });
    }

    return new StepResponse(candidates);
  },
);
