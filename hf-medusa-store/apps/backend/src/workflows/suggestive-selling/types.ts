/**
 * Shared types for the SuggestiveSelling evaluation workflow (SRS §7.1 / SPEC A.4).
 */

export type SuggestionTier = "manual" | "category" | "behavioral";

/**
 * A ranked suggestion candidate produced by the evaluation pipeline. This is the
 * pre-enrichment shape (ids + provenance); pricing/stock enrichment and BR-02
 * filtering are downstream stages owned separately.
 */
export type SuggestionCandidate = {
  product_id: string;
  tier: SuggestionTier;
  rule_id: string | null;
  display_order: number;
  custom_label: string | null;
  source: "tier1" | "tier2";
};

export type EvaluateProductInput = {
  productId: string;
  limit?: number;
};
