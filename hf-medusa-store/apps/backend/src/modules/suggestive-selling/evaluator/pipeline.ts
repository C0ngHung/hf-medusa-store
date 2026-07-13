import { roundMoney } from "../utils/money";
import { SUGGESTION_TIER_ORDER } from "../constants";
import type {
  CalculatedPriceLike,
  DropReason,
  EnrichedCandidate,
  FilterContext,
  FilterOutcome,
  ProductSuggestion,
  SuggestionTier,
  VariantLike,
} from "../types";

/**
 * Pure evaluation pipeline — SPEC A.4 (steps 4–6) / A.5.
 *
 * Every function here is a deterministic pure function: no I/O, no Medusa
 * imports, no clock/network. This is where the suggestion business rules live
 * (BR-01 ranking, BR-02 filtering, response shaping) so they can be unit-tested
 * in isolation (T-SUGG-01..05) and the dry-run/preview path stays trustworthy.
 * The EvaluationEngine does the I/O and hands data to these functions.
 */

/** Tier → sort weight (lower = higher priority). Tier 1 manual first (BR-01). */
const TIER_WEIGHT: Record<SuggestionTier, number> =
  SUGGESTION_TIER_ORDER.reduce(
    (acc, tier, index) => {
      acc[tier] = index;
      return acc;
    },
    {} as Record<SuggestionTier, number>,
  );

/** Case-insensitive membership test for the consumable exemption (BR-02(d)). */
export function isConsumable(
  categoryNames: string[],
  consumableCategories: Set<string>,
): boolean {
  const normalized = new Set(
    Array.from(consumableCategories, (c) => c.toLowerCase()),
  );
  return categoryNames.some((name) => normalized.has(name.toLowerCase()));
}

/**
 * BR-02 / SUGG-002 filter — drop a candidate if ANY condition holds, evaluated
 * cheapest-first. Returns survivors plus provenance for the dropped ones (kept
 * for admin dry-run only — SPEC A.5). Pure: all per-customer state arrives via
 * FilterContext, so the same candidate buffer personalizes to any viewer (D7).
 */
export function applyBr02Filter(
  candidates: EnrichedCandidate[],
  ctx: FilterContext,
): FilterOutcome {
  const kept: EnrichedCandidate[] = [];
  const dropped: Array<{ product_id: string; reason: DropReason }> = [];

  for (const candidate of candidates) {
    const reason = dropReasonFor(candidate, ctx);
    if (reason) {
      dropped.push({ product_id: candidate.product_id, reason });
    } else {
      kept.push(candidate);
    }
  }

  return { kept, dropped };
}

/** First matching drop reason for a candidate, or null if it survives (BR-02). */
function dropReasonFor(
  candidate: EnrichedCandidate,
  ctx: FilterContext,
): DropReason | null {
  const pid = candidate.product_id;

  // (f) inactive / unpublished / outside sales window — intrinsic, check first.
  if (candidate.status !== "published") return "inactive";
  // (e) never suggest the product being viewed (product context only).
  if (ctx.sourceProductId && pid === ctx.sourceProductId) return "self";
  // (a) already in the cart (any variant).
  if (ctx.cartProductIds.has(pid)) return "in_cart";
  // (b) out of stock at the assigned store (no purchasable variant).
  if (!candidate.in_stock) return "out_of_stock";
  // (c) dismissed this session for this context.
  if (ctx.dismissedProductIds.has(pid)) return "dismissed";
  // (d) bought within the recent window — durable goods only; consumables exempt.
  if (
    ctx.recentlyPurchasedProductIds.has(pid) &&
    !isConsumable(candidate.category_names, ctx.consumableCategories)
  ) {
    return "recent_purchase";
  }

  return null;
}

/**
 * BR-01 rank + limit (SPEC A.4 step 5): order by tier priority then display_order,
 * dedupe by product (a product suggested by two rules keeps its highest-priority
 * slot), and cap to `limit`. Stable: ties preserve input order.
 */
export function rankAndLimit(
  candidates: EnrichedCandidate[],
  limit: number,
): EnrichedCandidate[] {
  const ordered = candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => {
      const tierDelta =
        TIER_WEIGHT[a.candidate.tier] - TIER_WEIGHT[b.candidate.tier];
      if (tierDelta !== 0) return tierDelta;
      const orderDelta = a.candidate.display_order - b.candidate.display_order;
      if (orderDelta !== 0) return orderDelta;
      return a.index - b.index;
    })
    .map(({ candidate }) => candidate);

  const seen = new Set<string>();
  const deduped: EnrichedCandidate[] = [];
  for (const candidate of ordered) {
    if (seen.has(candidate.product_id)) continue;
    seen.add(candidate.product_id);
    deduped.push(candidate);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

/**
 * Variant resolution (SPEC A.4 step 6 / SUGG-003). A single variant is auto-
 * selectable; multiple variants require the customer to pick one (bottom sheet),
 * so we expose `requires_variant_selection` and leave `variant_id` null.
 */
export function resolveVariant(variants: VariantLike[]): {
  variant_id: string | null;
  requires_variant_selection: boolean;
} {
  if (variants.length === 1) {
    return { variant_id: variants[0].id, requires_variant_selection: false };
  }
  if (variants.length === 0) {
    return { variant_id: null, requires_variant_selection: false };
  }
  return { variant_id: null, requires_variant_selection: true };
}

/**
 * Price fields (SPEC A.4 step 6, API Contract §1.1). Uses the cheapest variant as
 * the displayed "from" price. `price` is the original list price; `discount_price`
 * is the promo price when an item-level promotion applies (calculated < original),
 * else null. All amounts floored to integer VND (INT-01/D1).
 */
export function computePriceFields(variants: VariantLike[]): {
  price: number | null;
  discount_price: number | null;
} {
  const priced = variants
    .map((v) => v.calculated_price)
    .filter(
      (p): p is CalculatedPriceLike =>
        !!p && typeof p.calculated_amount === "number",
    );

  if (priced.length === 0) {
    return { price: null, discount_price: null };
  }

  const cheapest = priced.reduce((min, p) =>
    (p.calculated_amount as number) < (min.calculated_amount as number)
      ? p
      : min,
  );

  const calculated = roundMoney(cheapest.calculated_amount as number);
  const original =
    typeof cheapest.original_amount === "number"
      ? roundMoney(cheapest.original_amount)
      : calculated;

  const price = Math.max(original, calculated);
  const discount_price = calculated < price ? calculated : null;

  return { price, discount_price };
}

/**
 * Response mapping (task 4, API Contract §1.1): project an enriched candidate to
 * the wire shape. `label` is the admin custom label (Tier-1 "Best Match"), null
 * for backfilled Tier-2 items. `display_order` is 1-based for the frontend.
 */
export function toProductSuggestion(
  candidate: EnrichedCandidate,
  position: number,
): ProductSuggestion {
  return {
    product_id: candidate.product_id,
    handle: candidate.handle,
    variant_id: candidate.variant_id,
    name: candidate.name,
    image_url: candidate.image_url,
    price: candidate.price,
    discount_price: candidate.discount_price,
    in_stock: candidate.in_stock,
    requires_variant_selection: candidate.requires_variant_selection,
    status: candidate.status,
    category_names: candidate.category_names,
    brand: candidate.brand,
    tier: candidate.tier,
    rule_id: candidate.rule_id,
    label: candidate.custom_label,
    display_order: position,
  };
}

/**
 * Full filter → rank → limit → project pass (SPEC A.4 steps 4–6). Kept as one
 * pure entry point so both the engine and unit tests exercise identical logic.
 */
export function finalizeSuggestions(
  candidates: EnrichedCandidate[],
  ctx: FilterContext,
  limit: number,
): ProductSuggestion[] {
  const { kept } = applyBr02Filter(candidates, ctx);
  const ranked = rankAndLimit(kept, limit);
  return ranked.map((candidate, index) =>
    toProductSuggestion(candidate, index + 1),
  );
}
