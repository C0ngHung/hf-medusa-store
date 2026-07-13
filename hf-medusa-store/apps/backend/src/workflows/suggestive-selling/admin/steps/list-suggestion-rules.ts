import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { SUGGESTIVE_SELLING_MODULE } from "../../../../modules/suggestive-selling";

/**
 * List suggestion rules with children (SRS §6.1). Read-only → no compensation.
 * Service is resolved here in the step, never in the route.
 */
export const listSuggestionRulesStep = createStep(
  "list-suggestion-rules",
  async (
    input: { filters: Record<string, unknown>; take: number; skip: number },
    { container },
  ) => {
    const service: any = container.resolve(SUGGESTIVE_SELLING_MODULE);
    const [suggestion_rules, count] = await service.listAndCountSuggestionRules(
      input.filters,
      {
        relations: ["items", "conditions", "sources"],
        take: input.take,
        skip: input.skip,
        order: { priority: "ASC" },
      },
    );
    return new StepResponse({ suggestion_rules, count });
  },
);
