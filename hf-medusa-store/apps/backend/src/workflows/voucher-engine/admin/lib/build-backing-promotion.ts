/**
 * buildBackingPromotion — pure builder for the CANONICAL backing Medusa
 * Promotion (+ inline Campaign) provisioned for a voucher at admin-create time
 * (SPEC Decision C/H, Phase 2). Side-effect free so it is unit-testable.
 *
 * IMPORTANT: this Promotion is NEVER attached to a cart (Decision H — the
 * discount rides a `cart.credit_lines` entry). Its `application_method`,
 * `rules`, `target_rules`, `limit`, and campaign `budget` therefore enforce
 * NOTHING at runtime — VoucherEngine's V1–V8 pipeline + StackingEngine remain
 * the sole enforcers. They exist as the idiomatic "voucher is a real promotion"
 * representation for admin/analytics visibility, mirroring the voucher config in
 * native form.
 *
 * Native-mapping notes:
 *  - percentage: our `discount_value` is basis points (2000 = 20.00%); Medusa's
 *    `application_method.value` is the percent number, so we divide by 100.
 *  - fixed_amount: `discount_value` is raw VND → used directly as `value`.
 *  - V2 window → Campaign `starts_at`/`ends_at`.
 *  - V3 global limit → `Promotion.limit`.
 *  - V4 per-user limit → Campaign `use_by_attribute` budget (attribute customer_id).
 *  - V5 min order → `rules` `item_total gte`.
 *  - V6 scope → `application_method.target_rules` — ONLY when a single attribute
 *    is used (product-only OR category-only). A mixed product+category voucher
 *    needs cross-attribute OR, which native `target_rules` (AND-combined) cannot
 *    express, so we omit target_rules and let `resolveEligibleItems` enforce it.
 *  - V7 segment is a stub (undefined source) → no native rule emitted.
 */
import type {
  CreatePromotionDTO,
  CreatePromotionRuleDTO,
} from "@medusajs/framework/types";
import type { CreateVoucherStepInput } from "../steps/create-voucher";

const CURRENCY = "vnd";
const BPS_PER_PERCENT = 100;

/**
 * `@medusajs/types`' `CreatePromotionDTO` omits `metadata`, but the
 * underlying Promotion DML model DOES declare `metadata: model.json()`
 * (see `@medusajs/promotion/dist/models/promotion.js`) and Medusa persists +
 * returns it at runtime (our integration tests read `metadata.voucher_engine`
 * back via `query.graph`). This is a type-generation gap, not a runtime
 * restriction — extend rather than widen with `as any` so the rest of the
 * DTO stays fully checked.
 */
export type CreatePromotionWithMetadataDTO = CreatePromotionDTO & {
  metadata?: Record<string, unknown> | null;
};

export function buildBackingPromotion(
  input: CreateVoucherStepInput,
  code: string,
): CreatePromotionWithMetadataDTO[] {
  const isPercentage = input.discount_type === "percentage";

  // V5 — minimum order value as an order-scope rule.
  const rules: CreatePromotionRuleDTO[] = [];
  if (input.min_order_value != null) {
    rules.push({
      attribute: "item_total",
      operator: "gte",
      values: [String(input.min_order_value)],
    });
  }

  // V6 — scope target_rules, single-attribute only (see header note).
  const productIds = input.applicable_product_ids ?? [];
  const categoryIds = input.applicable_category_ids ?? [];
  const hasProductScope = productIds.length > 0;
  const hasCategoryScope = categoryIds.length > 0;
  const targetRules: CreatePromotionRuleDTO[] = [];
  if (hasProductScope && !hasCategoryScope) {
    targetRules.push({
      attribute: "items.product.id",
      operator: "in",
      values: productIds,
    });
  } else if (hasCategoryScope && !hasProductScope) {
    targetRules.push({
      attribute: "items.product.categories.id",
      operator: "in",
      values: categoryIds,
    });
  }

  const promotion: CreatePromotionWithMetadataDTO = {
    code,
    type: "standard",
    status: input.is_active === false ? "inactive" : "active",
    is_automatic: false,
    metadata: { voucher_engine: true, voucher_code: code },
    // V3 — global usage limit (null/undefined ⇒ unlimited).
    ...(input.usage_limit != null ? { limit: input.usage_limit } : {}),
    application_method: {
      type: isPercentage ? "percentage" : "fixed",
      target_type: "items",
      allocation: "across",
      value: isPercentage
        ? input.discount_value / BPS_PER_PERCENT
        : input.discount_value,
      currency_code: CURRENCY,
      ...(targetRules.length > 0 ? { target_rules: targetRules } : {}),
    },
    ...(rules.length > 0 ? { rules } : {}),
    campaign: {
      name: `Voucher ${code}`,
      campaign_identifier: `voucher-${code}`,
      starts_at: input.valid_from,
      ends_at: input.valid_to,
      // V4 — per-user limit as a per-customer usage budget (advisory; never
      // increments since the promotion is not cart-attached).
      ...(input.per_user_limit != null
        ? {
            budget: {
              type: "use_by_attribute" as const,
              attribute: "customer_id",
              limit: input.per_user_limit,
            },
          }
        : {}),
    },
  };

  return [promotion];
}
