import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import type { SuggestionCandidate } from "../types";

/**
 * Step 2 (SRS SUGG-001 Tier 1) — flatten manual-curation rule items into
 * candidates, ordered by display_order, de-duplicated by product, excluding the
 * source product itself. Pure transform (no I/O) → no compensation.
 */
export const buildTier1CandidatesStep = createStep(
  "build-tier1-candidates",
  async (input: { rules: any[]; productId: string }) => {
    const seen = new Set<string>();
    const candidates: SuggestionCandidate[] = [];

    for (const rule of (input.rules ?? []).filter((r) => r.tier === "manual")) {
      const items = [...(rule.items ?? [])].sort(
        (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
      );
      for (const it of items) {
        const pid = it.suggested_product_id;
        if (pid === input.productId || seen.has(pid)) continue;
        seen.add(pid);
        candidates.push({
          product_id: pid,
          tier: "manual",
          rule_id: rule.id,
          display_order: it.display_order ?? 0,
          custom_label: it.custom_label ?? null,
          source: "tier1",
        });
      }
    }

    return new StepResponse(candidates);
  },
);
