import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { rankAndLimit } from "../lib/evaluate";
import type { SuggestionCandidate } from "../types";

/**
 * Step 4 (SRS §7.1 rankAndLimit, BR-01) — order by tier then display_order,
 * de-duplicate, cap at the limit. Pure transform delegated to lib/evaluate.
 */
export const rankAndLimitStep = createStep(
  "rank-and-limit",
  async (input: { candidates: SuggestionCandidate[]; limit?: number }) => {
    return new StepResponse(rankAndLimit(input.candidates, input.limit));
  },
);
