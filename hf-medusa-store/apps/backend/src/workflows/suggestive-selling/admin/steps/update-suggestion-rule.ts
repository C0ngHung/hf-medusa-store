import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { SUGGESTIVE_SELLING_MODULE } from "../../../../modules/suggestive-selling";

type UpdateSuggestionRuleStepInput = {
  id: string;
  items?: any[];
  conditions?: any[];
  source_product_ids?: string[];
  [field: string]: any;
};

/**
 * Update a suggestion rule (SRS §6.1). Scalar fields are patched; if items /
 * conditions / source_product_ids are provided they REPLACE the existing sets.
 * Returns the id so downstream steps (cache, retrieve) order after this one.
 * No compensation: admin config edits are not auto-reverted (SPEC didn't require).
 */
export const updateSuggestionRuleStep = createStep(
  "update-suggestion-rule",
  async (input: UpdateSuggestionRuleStepInput, { container }) => {
    const service: any = container.resolve(SUGGESTIVE_SELLING_MODULE);
    const { id, items, conditions, source_product_ids, ...ruleData } = input;

    if (Object.keys(ruleData).length) {
      await service.updateSuggestionRules({ id, ...ruleData });
    }

    if (items) {
      const existing = await service.listSuggestionRuleItems(
        { rule_id: id },
        { select: ["id"] },
      );
      if (existing.length) {
        await service.deleteSuggestionRuleItems(existing.map((i: any) => i.id));
      }
      if (items.length) {
        await service.createSuggestionRuleItems(
          items.map((i: any) => ({ ...i, rule_id: id })),
        );
      }
    }

    if (conditions) {
      const existing = await service.listCartSuggestionConditions(
        { rule_id: id },
        { select: ["id"] },
      );
      if (existing.length) {
        await service.deleteCartSuggestionConditions(
          existing.map((c: any) => c.id),
        );
      }
      if (conditions.length) {
        await service.createCartSuggestionConditions(
          conditions.map((c: any) => ({ ...c, rule_id: id })),
        );
      }
    }

    if (source_product_ids) {
      const existing = await service.listSuggestionRuleSources(
        { rule_id: id },
        { select: ["id"] },
      );
      if (existing.length) {
        await service.deleteSuggestionRuleSources(
          existing.map((s: any) => s.id),
        );
      }
      if (source_product_ids.length) {
        await service.createSuggestionRuleSources(
          source_product_ids.map((source_product_id: string) => ({
            source_product_id,
            rule_id: id,
          })),
        );
      }
    }

    return new StepResponse(id);
  },
);
