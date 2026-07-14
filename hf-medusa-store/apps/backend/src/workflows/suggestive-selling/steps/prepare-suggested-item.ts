import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { SUGGESTIVE_SELLING_MODULE } from "../../../modules/suggestive-selling";
import { SuggestedItemError } from "../lib/suggested-item-errors";

/**
 * Step 1 of addSuggestedItemWorkflow (SUGG-003 / API Contract §1.1). Read-only:
 * validate attribution (SEC-01) → resolve variant → idempotency lookup. No
 * mutation, so no compensation. Throws SuggestedItemError on any rejection; the
 * add itself is skipped by the workflow when `is_replay` is true.
 */
export type AddSuggestedItemInput = {
  cart_id: string;
  product_id: string;
  variant_id?: string | null;
  quantity: number;
  idempotency_key: string;
  attribution: {
    rule_id?: string | null;
    source_context: "product_view" | "cart";
    source_product_id?: string | null;
  };
  slot?: number | null;
  customer_id?: string | null;
  session_id?: string | null;
};

type LineItemMeta = {
  suggestion_rule_id: string | null;
  source_context: "product_view" | "cart";
  source_product_id: string | null;
  tier: string | null;
  idempotency_key: string;
};

export type PreparedSuggestedItem = {
  is_replay: boolean;
  add_item: {
    variant_id: string;
    quantity: number;
    metadata: LineItemMeta;
  } | null;
  event: {
    action: "add_to_cart";
    suggested_product_id: string;
    source_product_id: string | null;
    rule_id: string | null;
    source_context: "product_view" | "cart";
    tier: string | null;
    slot: number | null;
    customer_id: string | null;
    session_id: string | null;
  } | null;
};

export const prepareSuggestedItemStep = createStep(
  "prepare-suggested-item",
  async (
    input: AddSuggestedItemInput,
    { container },
  ): Promise<StepResponse<PreparedSuggestedItem>> => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const cartModule = container.resolve(Modules.CART);
    const suggestive: any = container.resolve(SUGGESTIVE_SELLING_MODULE);

    // 1. Attribution (SEC-01). Tier-1 carries a rule_id → it MUST exist & be
    //    active. Tier-2 (category) has no rule_id → nothing to validate.
    let tier: string | null = null;
    if (input.attribution.rule_id) {
      const rules = await suggestive.listSuggestionRules(
        { id: input.attribution.rule_id, is_active: true },
        { select: ["id", "tier"] },
      );
      if (!rules.length) {
        throw new SuggestedItemError("SUGGESTION_INVALID_ATTRIBUTION");
      }
      tier = rules[0].tier ?? null;
    }

    // 2. Idempotency (D8 / EC-03): a prior line item on this cart already tagged
    //    with the same key → replay, add nothing.
    const existing = await cartModule.listLineItems(
      { cart_id: input.cart_id },
      { select: ["id", "metadata"] },
    );
    const replay = existing.some(
      (li: any) => li.metadata?.idempotency_key === input.idempotency_key,
    );
    if (replay) {
      return new StepResponse({ is_replay: true, add_item: null, event: null });
    }

    // 3. Resolve variant + published check.
    const { data: products } = await query.graph({
      entity: "product",
      filters: { id: input.product_id },
      fields: ["id", "status", "variants.id", "variants.title"],
    });
    const product = products?.[0];
    if (!product || product.status !== "published") {
      throw new SuggestedItemError("SUGGESTION_PRODUCT_INACTIVE");
    }
    const variants: { id: string; title?: string }[] = product.variants ?? [];

    let variantId: string;
    if (input.variant_id) {
      if (!variants.some((v) => v.id === input.variant_id)) {
        throw new SuggestedItemError("SUGGESTION_PRODUCT_INACTIVE");
      }
      variantId = input.variant_id;
    } else if (variants.length === 1) {
      variantId = variants[0].id; // single = default (Medusa has no default flag)
    } else if (variants.length > 1) {
      // Needs a choice → open the bottom sheet client-side.
      throw new SuggestedItemError("SUGGESTION_VARIANT_SELECTION_REQUIRED", {
        variants: variants.map((v) => ({ id: v.id, title: v.title })),
      });
    } else {
      throw new SuggestedItemError("SUGGESTION_PRODUCT_INACTIVE");
    }

    // 4. Build the add payload + the attribution metadata (persisted on the line
    //    item) + the add_to_cart analytics event. Stock is re-checked
    //    authoritatively by addToCartWorkflow's internal inventory confirm.
    const metadata: LineItemMeta = {
      suggestion_rule_id: input.attribution.rule_id ?? null,
      source_context: input.attribution.source_context,
      source_product_id: input.attribution.source_product_id ?? null,
      tier,
      idempotency_key: input.idempotency_key,
    };

    return new StepResponse({
      is_replay: false,
      add_item: { variant_id: variantId, quantity: input.quantity, metadata },
      event: {
        action: "add_to_cart",
        suggested_product_id: input.product_id,
        source_product_id: input.attribution.source_product_id ?? null,
        rule_id: input.attribution.rule_id ?? null,
        source_context: input.attribution.source_context,
        tier,
        slot: input.slot ?? null,
        customer_id: input.customer_id ?? null,
        session_id: input.session_id ?? null,
      },
    });
  },
);
