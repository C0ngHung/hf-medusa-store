import { MedusaService } from "@medusajs/framework/utils";
import SuggestionRule from "./models/suggestion-rule";
import SuggestionRuleItem from "./models/suggestion-rule-item";
import SuggestionRuleSource from "./models/suggestion-rule-source";
import CartSuggestionCondition from "./models/cart-suggestion-condition";
import SuggestionEvent from "./models/suggestion-event";
import CategoryComplementMapping from "./models/category-complement-mapping";
import ProductBulkMapping from "./models/product-bulk-mapping";
import CategoryTopSeller from "./models/category-top-seller";

/**
 * SuggestiveSellingService — SRS §2.1.
 * MedusaService auto-generates CRUD (list/retrieve/create/update/delete +
 * soft-delete) for every model below. Custom query/orchestration logic
 * (rule evaluation, cache) is layered on top by the evaluator + workflows.
 */
// Tier priority band (SRS SUGG-001): manual > category > behavioral.
const TIER_RANK: Record<string, number> = {
  manual: 0,
  category: 1,
  behavioral: 2,
};

class SuggestiveSellingService extends MedusaService({
  SuggestionRule,
  SuggestionRuleItem,
  SuggestionRuleSource,
  CartSuggestionCondition,
  SuggestionEvent,
  CategoryComplementMapping,
  ProductBulkMapping,
  CategoryTopSeller,
}) {
  /**
   * SPEC A.3 — active product-level rules targeting `sourceProductId`.
   * Resolves the SuggestionRuleSource pivot → rules (type=product, active,
   * inside their valid window), ordered by tier then priority. Items eager-loaded
   * so the Tier-1 step can read them without a second round-trip.
   */
  async listActiveProductRules(sourceProductId: string, at: Date = new Date()) {
    const pivots = await this.listSuggestionRuleSources(
      { source_product_id: sourceProductId },
      { select: ["rule_id"] },
    );
    const ruleIds = [...new Set(pivots.map((p: any) => p.rule_id))];
    if (!ruleIds.length) return [];

    const rules = await this.listSuggestionRules(
      { id: ruleIds, type: "product", is_active: true },
      { relations: ["items"] },
    );

    const inWindow = (r: any) =>
      (!r.valid_from || new Date(r.valid_from) <= at) &&
      (!r.valid_to || at <= new Date(r.valid_to));

    return rules
      .filter(inWindow)
      .sort(
        (a: any, b: any) =>
          (TIER_RANK[a.tier] ?? 99) - (TIER_RANK[b.tier] ?? 99) ||
          b.priority - a.priority,
      );
  }

  /**
   * SPEC A.3 — active cart-level rules (SUGG-004), inside their valid window,
   * with their conditions eager-loaded, ordered by priority asc so the evaluator
   * runs them CR-01→CR-04 (2.4.7 / BR-03). Empty-conditions rules never fire
   * (matchesCartRule), but are still returned; firing is decided downstream.
   */
  async listActiveCartRules(at: Date = new Date()) {
    const rules = await this.listSuggestionRules(
      { type: "cart", is_active: true },
      { relations: ["conditions"] },
    );

    const inWindow = (r: any) =>
      (!r.valid_from || new Date(r.valid_from) <= at) &&
      (!r.valid_to || at <= new Date(r.valid_to));

    return rules
      .filter(inWindow)
      .sort((a: any, b: any) => (a.priority ?? 0) - (b.priority ?? 0));
  }

  /**
   * SPEC A.3 — active category-complement mappings for a source category,
   * ordered by display_order (Tier-2 backfill source, SRS SUGG-001).
   */
  async listComplements(sourceCategoryId: string) {
    return this.listCategoryComplementMappings(
      { source_category_id: sourceCategoryId, is_active: true },
      { order: { display_order: "ASC" } },
    );
  }

  /**
   * Tier-2 ranking (SPEC A.6, plan B) — precomputed top sellers across the given
   * categories, highest sales first. Empty ⇒ the backfill step falls back to
   * newest-first (plan C). Deduped by product (a product may sit in several
   * complement categories), keeping its highest sales_count.
   */
  async listTopSellersByCategories(categoryIds: string[]) {
    if (!categoryIds?.length) return [];
    const rows = await this.listCategoryTopSellers(
      { category_id: categoryIds },
      { order: { sales_count: "DESC" } },
    );
    const bestByProduct = new Map<string, any>();
    for (const r of rows) {
      const prev = bestByProduct.get(r.product_id);
      if (!prev || r.sales_count > prev.sales_count) {
        bestByProduct.set(r.product_id, r);
      }
    }
    return [...bestByProduct.values()].sort(
      (a, b) => b.sales_count - a.sales_count,
    );
  }
}

export default SuggestiveSellingService;
