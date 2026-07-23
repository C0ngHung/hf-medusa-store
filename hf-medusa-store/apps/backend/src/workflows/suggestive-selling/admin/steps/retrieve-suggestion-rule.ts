import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { SUGGESTIVE_SELLING_MODULE } from "../../../../modules/suggestive-selling";

/**
 * Retrieve one suggestion rule with children (SRS §6.1). Read-only.
 */
export const retrieveSuggestionRuleStep = createStep(
  "retrieve-suggestion-rule",
  async (input: { id: string }, { container }) => {
    const service: any = container.resolve(SUGGESTIVE_SELLING_MODULE);
    const suggestion_rule = await service.retrieveSuggestionRule(input.id, {
      relations: ["items", "conditions", "sources"],
    });
    return new StepResponse(suggestion_rule);
  },
);
