import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { SUGGESTIVE_SELLING_MODULE } from "../../../../modules/suggestive-selling";

/**
 * Soft-delete a suggestion rule (SRS §6.1 — children cascade per model def).
 * Returns the id so cache invalidation orders after the delete.
 */
export const softDeleteSuggestionRuleStep = createStep(
  "soft-delete-suggestion-rule",
  async (input: { id: string }, { container }) => {
    const service: any = container.resolve(SUGGESTIVE_SELLING_MODULE);
    await service.softDeleteSuggestionRules(input.id);
    return new StepResponse(input.id);
  },
);
