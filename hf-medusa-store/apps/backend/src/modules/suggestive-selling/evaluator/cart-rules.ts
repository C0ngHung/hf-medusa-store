import {
  CART_LIMIT,
  CR02_PRICE_BAND_MULT,
  CR04_DEFAULT_MAX_QUANTITY,
} from "../constants";
import type { CartRuleCode, CartSuggestion, EnrichedProduct } from "../types";

/**
 * Cart-level rule logic — SPEC A.6 (SUGG-004, tasks 2.4.2/2.4.3/2.4.5–2.4.8).
 *
 * Every function here is a deterministic PURE function: no I/O, no Medusa
 * imports, no clock. The cart engine (cart-engine.ts) does the data access and
 * hands plain data to these matchers/assemblers, so the CR-01…CR-04 firing rules
 * are unit-testable in isolation (T-SUGG-07/08). Constants only — no side effects.
 */

/** A single cart line, reduced to the fields the cart rules read (SPEC A.6). */
export interface CartLine {
  quantity: number;
  categoryIds: string[];
  categoryNames: string[];
}

/** The cart, reduced to what the cart rules need to decide firing (SPEC A.6). */
export interface CartRuleContext {
  /** Post-item-promo subtotal (voucher excluded) — CR-02 base (D5). */
  subtotal: number;
  /**
   * Free-shipping threshold in VND for CR-02 (D5). Resolved by the engine from
   * the configured shipping-option price rule (`item_total` → free), so the nudge
   * and the actual free-shipping discount share one source of truth; the engine
   * falls back to FREE_SHIPPING_THRESHOLD when no rule is configured (OI-04).
   */
  freeShippingThreshold: number;
  /** Distinct category ids present across all cart lines (CR-01). */
  categoryIds: string[];
  /** Distinct product brands present in the cart (CR-03). */
  brands: string[];
  lines: CartLine[];
}

/** A cart-suggestion-condition row, reduced to what the matcher reads (SPEC A.6). */
export interface CartRuleCondition {
  condition_type:
    | "category_missing"
    | "threshold_near"
    | "brand_match"
    | "consumable_upsell";
  condition_params?: Record<string, any> | null;
}

/** condition_type → CR code, and the fixed CR-01→CR-04 evaluation order (2.4.7/BR-03). */
export const CR_CODE_BY_CONDITION: Record<
  CartRuleCondition["condition_type"],
  CartRuleCode
> = {
  category_missing: "CR-01",
  threshold_near: "CR-02",
  brand_match: "CR-03",
  consumable_upsell: "CR-04",
};

/** Sort weight for the fixed CR-01→CR-04 order (lower fires first, BR-03). */
export const CR_RANK: Record<CartRuleCode, number> = {
  "CR-01": 0,
  "CR-02": 1,
  "CR-03": 2,
  "CR-04": 3,
};

/**
 * CR-02 fire test (D5): within 15% below the threshold, i.e.
 * `threshold × (1 − pct) ≤ subtotal < threshold`. Guards a positive threshold so
 * a misconfigured 0 never fires. Pure.
 */
export function cr02Fires(
  subtotal: number,
  threshold: number,
  pct: number,
): boolean {
  if (threshold <= 0) return false;
  return threshold * (1 - pct) <= subtotal && subtotal < threshold;
}

/**
 * CR-02 price band (D4): a nudge item must cost between `remaining` and
 * `remaining × mult` so adding it crosses the threshold without overshooting.
 */
export function cr02Band(
  remaining: number,
  mult: number = CR02_PRICE_BAND_MULT,
): { min: number; max: number } {
  return { min: remaining, max: remaining * mult };
}

/**
 * Does one cart condition hold against the cart? (SPEC A.6 firing tests.)
 * Only decides FIRING — candidate generation (which products to suggest) is the
 * engine's job. Pure.
 */
export function matchesCartCondition(
  condition: CartRuleCondition,
  context: CartRuleContext,
): boolean {
  const params = condition.condition_params ?? {};

  switch (condition.condition_type) {
    // CR-01 (2.4.2): cart holds ≥1 of the rule's watched source categories.
    case "category_missing": {
      const sources: unknown = params.source_category_ids;
      if (!Array.isArray(sources) || sources.length === 0) return false;
      const inCart = new Set(context.categoryIds);
      return sources.some((id) => typeof id === "string" && inCart.has(id));
    }

    // CR-02 (2.4.3): subtotal within 15% below the free-shipping threshold (D5).
    // Threshold comes from the cart context (resolved from the shipping price
    // rule by the engine), not a hard-coded constant.
    case "threshold_near": {
      const pct = params.percentage;
      if (typeof pct !== "number" || pct < 0 || pct > 1) return false;
      return cr02Fires(context.subtotal, context.freeShippingThreshold, pct);
    }

    // CR-03 (2.4.5): every item shares a single brand (distinct non-empty brand = 1).
    case "brand_match": {
      const distinct = new Set(context.brands.filter(Boolean));
      return distinct.size === 1;
    }

    // CR-04 (2.4.6): a consumable line at qty ≤ max_quantity. When the rule
    // scopes consumable_category_ids, the line must belong to one of them;
    // otherwise any low-qty line qualifies.
    case "consumable_upsell": {
      const maxQty = numberOr(params.max_quantity, CR04_DEFAULT_MAX_QUANTITY);
      const scope: unknown = params.consumable_category_ids;
      const scopedIds =
        Array.isArray(scope) && scope.length > 0
          ? new Set(scope.filter((id): id is string => typeof id === "string"))
          : null;
      return context.lines.some(
        (line) =>
          line.quantity <= maxQty &&
          (!scopedIds || line.categoryIds.some((id) => scopedIds.has(id))),
      );
    }

    default:
      return false;
  }
}

/**
 * A cart rule fires only when it has ≥1 condition and ALL conditions match
 * (AND semantics, 2.4.7). An empty rule never fires. Priority CR-01→CR-04 is
 * decided by the order the engine runs the rules (sorted priority asc), not here.
 */
export function matchesCartRule(
  conditions: CartRuleCondition[],
  context: CartRuleContext,
): boolean {
  if (!conditions || conditions.length === 0) return false;
  return conditions.every((c) => matchesCartCondition(c, context));
}

/** A candidate collected from a fired rule, before dedupe/cap (prompt 3.2). */
export interface CollectedCartCandidate {
  product: EnrichedProduct;
  code: CartRuleCode;
  /** CR-02 badge; null for the other rules. */
  badge: string | null;
}

/**
 * Merge candidates across fired rules into the final cart response (2.4.8/BR-04).
 * Candidates arrive in rule-fire order (CR-01→CR-04); we dedupe by product so a
 * product suggested by two rules keeps the FIRST rule's code + badge, then cap to
 * `limit` (default CART_LIMIT = 3). Each survivor is projected to the wire shape
 * with tier `"cart"` and `rule_id: null` (attributed by CR code, not rule id). Pure.
 */
export function mergeDedupeCart(
  collected: CollectedCartCandidate[],
  limit: number = CART_LIMIT,
): CartSuggestion[] {
  const seen = new Set<string>();
  const out: CartSuggestion[] = [];

  for (const { product, code, badge } of collected ?? []) {
    if (out.length >= limit) break;
    if (seen.has(product.product_id)) continue;
    seen.add(product.product_id);
    out.push({
      product_id: product.product_id,
      handle: product.handle,
      variant_id: product.variant_id,
      name: product.name,
      image_url: product.image_url,
      price: product.price,
      discount_price: product.discount_price,
      in_stock: product.in_stock,
      requires_variant_selection: product.requires_variant_selection,
      status: product.status,
      category_names: product.category_names,
      brand: product.brand,
      tier: "cart",
      rule_id: null,
      rule_code: code,
      badge_text: badge,
    });
  }

  return out;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
