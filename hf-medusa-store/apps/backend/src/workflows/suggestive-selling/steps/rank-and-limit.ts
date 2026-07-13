import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { PRODUCT_LIMIT } from "../../../modules/suggestive-selling/constants";
import type { SuggestionCandidate } from "../types";

// Tier priority band (SRS SUGG-001): manual first, then category, then behavioral.
const TIER_RANK: Record<string, number> = {
  manual: 0,
  category: 1,
  behavioral: 2,
};

/**
 * Step 4 (SRS §7.1 rankAndLimit, BR-01) — order by tier then display_order,
 * de-duplicate by product, cap at the limit. Pure transform → no compensation.
 */
export const rankAndLimitStep = createStep(
  "rank-and-limit",
  async (input: { candidates: SuggestionCandidate[]; limit?: number }) => {
    const limit = input.limit ?? PRODUCT_LIMIT;
    const seen = new Set<string>();

    const ranked = [...(input.candidates ?? [])]
      .sort(
        (a, b) =>
          (TIER_RANK[a.tier] ?? 99) - (TIER_RANK[b.tier] ?? 99) ||
          a.display_order - b.display_order,
      )
      .filter((c) => {
        if (seen.has(c.product_id)) return false;
        seen.add(c.product_id);
        return true;
      })
      .slice(0, limit);

    return new StepResponse(ranked);
  },
);
