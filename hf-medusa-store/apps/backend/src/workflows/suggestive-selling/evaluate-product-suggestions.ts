import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { loadActiveProductRulesStep } from "./steps/load-active-product-rules";
import { buildTier1CandidatesStep } from "./steps/build-tier1-candidates";
import { backfillCategoryComplementsStep } from "./steps/backfill-category-complements";
import { rankAndLimitStep } from "./steps/rank-and-limit";
import type { EvaluateProductInput } from "./types";

/**
 * evaluateProductSuggestions (SRS §7.1 / SPEC A.4) — product-level "Complete
 * Your Setup" candidates. All steps are read-only (no compensation).
 *
 * Pipeline: load active rules → Tier-1 manual candidates → Tier-2 category
 * backfill (when < 3) → rank & limit. Downstream (Sơn): BR-02 filtering, pricing
 * enrichment, cache. The route stays thin and calls this workflow — never the
 * service directly.
 */
export const evaluateProductSuggestionsWorkflow = createWorkflow(
  "evaluate-product-suggestions",
  (input: EvaluateProductInput) => {
    const rules = loadActiveProductRulesStep({ productId: input.productId });

    const tier1 = buildTier1CandidatesStep({
      rules,
      productId: input.productId,
    });

    const backfilled = backfillCategoryComplementsStep({
      candidates: tier1,
      productId: input.productId,
      limit: input.limit,
    });

    const ranked = rankAndLimitStep({
      candidates: backfilled,
      limit: input.limit,
    });

    return new WorkflowResponse(ranked);
  },
);

export default evaluateProductSuggestionsWorkflow;
