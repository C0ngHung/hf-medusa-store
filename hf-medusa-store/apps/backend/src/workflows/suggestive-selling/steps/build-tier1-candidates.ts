import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { buildTier1Candidates } from "../lib/evaluate";

/**
 * Step 2 (SRS SUGG-001 Tier 1) — flatten manual-curation rule items into
 * candidates (ordered by display_order, de-duped, source excluded). Pure
 * transform delegated to lib/evaluate → no compensation.
 */
export const buildTier1CandidatesStep = createStep(
  "build-tier1-candidates",
  async (input: { rules: any[]; productId: string }) => {
    return new StepResponse(buildTier1Candidates(input.rules, input.productId));
  },
);
