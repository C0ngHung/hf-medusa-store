import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";
import { SUGGESTIVE_SELLING_MODULE } from "../../../modules/suggestive-selling";
import { PRODUCT_LIMIT } from "../../../modules/suggestive-selling/constants";
import { applyCategoryBackfill, needsBackfill } from "../lib/evaluate";
import type { SuggestionCandidate } from "../types";

/**
 * Step 3 (SRS SUGG-001 Tier 2) — when Tier-1 yields fewer than the threshold,
 * fetch complement-category products and backfill up to the limit. Data access
 * lives here; the assembly decision is delegated to lib/evaluate (pure).
 * Read-only → no compensation.
 *
 * Ranking source (SPEC A.6): precomputed top-seller snapshot (plan B, filled by
 * the compute-category-top-sellers job). When the snapshot is empty (cold start /
 * no orders) it falls back to newest-first (plan C), so suggestions never block.
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
    const candidates = input.candidates ?? [];

    // Skip all I/O when Tier-1 already meets the threshold.
    if (!needsBackfill(candidates)) {
      return new StepResponse(candidates);
    }

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

    // Plan B: precomputed top-seller ranking. Plan C fallback: newest-first.
    const take = limit + candidates.length + 5;
    const topSellers =
      await suggestive.listTopSellersByCategories(complementCatIds);
    const products = topSellers.length
      ? topSellers.slice(0, take).map((r: any) => ({ id: r.product_id }))
      : await productService.listProducts(
          { categories: { id: complementCatIds }, status: "published" },
          { order: { created_at: "DESC" }, take },
        );

    return new StepResponse(
      applyCategoryBackfill(candidates, products, {
        productId: input.productId,
        limit,
      }),
    );
  },
);
