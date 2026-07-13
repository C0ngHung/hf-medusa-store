import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { SUGGESTIVE_SELLING_MODULE } from "../../../../modules/suggestive-selling";

type CreateSuggestionRuleStepInput = {
  name: string;
  type: "product" | "cart";
  tier: "manual" | "category" | "behavioral";
  priority?: number;
  is_active?: boolean;
  valid_from?: Date | null;
  valid_to?: Date | null;
  items?: any[];
  conditions?: any[];
  source_product_ids?: string[];
};

/**
 * Create a suggestion rule with nested items/conditions/sources (SRS §6.1).
 * Compensation deletes the created rule so a later step failure rolls back.
 */
export const createSuggestionRuleStep = createStep(
  "create-suggestion-rule",
  async (input: CreateSuggestionRuleStepInput, { container }) => {
    const service: any = container.resolve(SUGGESTIVE_SELLING_MODULE);
    const {
      items = [],
      conditions = [],
      source_product_ids = [],
      ...ruleData
    } = input;
    const rule = await service.createSuggestionRules({
      ...ruleData,
      items,
      conditions,
      sources: source_product_ids.map((source_product_id) => ({
        source_product_id,
      })),
    });
    return new StepResponse(rule, rule.id);
  },
  async (ruleId, { container }) => {
    if (!ruleId) return;
    const service: any = container.resolve(SUGGESTIVE_SELLING_MODULE);
    await service.deleteSuggestionRules(ruleId);
  },
);
