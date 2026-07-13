import {
  PRODUCT_LIMIT,
  TIER1_MIN_SURVIVORS,
} from "../../../modules/suggestive-selling/constants";
import type { SuggestionCandidate } from "../types";

/**
 * Pure evaluation logic for product-level suggestions (SRS SUGG-001 / SPEC A.4).
 * Deterministic, no I/O — the workflow steps do the data access and delegate the
 * decisions here so the logic is unit-testable (T-SUGG-01 / T-SUGG-02).
 */

// Tier priority band (SRS SUGG-001): manual > category > behavioral.
const TIER_RANK: Record<string, number> = {
  manual: 0,
  category: 1,
  behavioral: 2,
};

/**
 * Tier 1 — flatten manual-curation rule items into candidates, ordered by
 * display_order, de-duped by product, excluding the source product itself.
 */
export function buildTier1Candidates(
  rules: any[],
  productId: string,
): SuggestionCandidate[] {
  const seen = new Set<string>();
  const out: SuggestionCandidate[] = [];

  for (const rule of (rules ?? []).filter((r) => r.tier === "manual")) {
    const items = [...(rule.items ?? [])].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
    );
    for (const it of items) {
      const pid = it.suggested_product_id;
      if (pid === productId || seen.has(pid)) continue;
      seen.add(pid);
      out.push({
        product_id: pid,
        tier: "manual",
        rule_id: rule.id,
        display_order: it.display_order ?? 0,
        custom_label: it.custom_label ?? null,
        source: "tier1",
      });
    }
  }

  return out;
}

/** True when Tier-1 survivors are below the SUGG-001 backfill threshold. */
export function needsBackfill(candidates: SuggestionCandidate[]): boolean {
  return (candidates ?? []).length < TIER1_MIN_SURVIVORS;
}

/**
 * Tier 2 — fill from an (already-fetched, ranked) list of complement products up
 * to the limit, excluding the source product and anything already suggested.
 * No-op when Tier-1 already meets the threshold.
 */
export function applyCategoryBackfill(
  candidates: SuggestionCandidate[],
  complementProducts: { id: string }[],
  opts: { productId: string; limit?: number },
): SuggestionCandidate[] {
  const limit = opts.limit ?? PRODUCT_LIMIT;
  const out = [...(candidates ?? [])];
  if (!needsBackfill(out)) return out;

  const exclude = new Set<string>([
    opts.productId,
    ...out.map((c) => c.product_id),
  ]);
  for (const p of complementProducts ?? []) {
    if (out.length >= limit) break;
    if (exclude.has(p.id)) continue;
    exclude.add(p.id);
    out.push({
      product_id: p.id,
      tier: "category",
      rule_id: null,
      display_order: out.length,
      custom_label: null,
      source: "tier2",
    });
  }
  return out;
}

/** Order by tier then display_order, de-dupe by product, cap at the limit. */
export function rankAndLimit(
  candidates: SuggestionCandidate[],
  limit: number = PRODUCT_LIMIT,
): SuggestionCandidate[] {
  const seen = new Set<string>();
  return [...(candidates ?? [])]
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
}
