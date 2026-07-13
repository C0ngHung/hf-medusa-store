import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { createSuggestionRuleStep } from "./steps/create-suggestion-rule";
import { invalidateSuggestionCacheStep } from "./steps/invalidate-suggestion-cache";
import { retrieveSuggestionRuleStep } from "./steps/retrieve-suggestion-rule";

/**
 * POST /admin/suggestion-rules (SRS §6.1). Create → invalidate cache → return the
 * full rule graph. Cache + retrieve consume the created id, so they order after
 * the create step; create rolls back via its compensation on any later failure.
 */
export const createSuggestionRuleWorkflow = createWorkflow(
  "create-suggestion-rule",
  (input: any) => {
    const rule = createSuggestionRuleStep(input);
    invalidateSuggestionCacheStep({ ruleId: rule.id });
    const suggestion_rule = retrieveSuggestionRuleStep({ id: rule.id });
    return new WorkflowResponse(suggestion_rule);
  },
);

export default createSuggestionRuleWorkflow;
