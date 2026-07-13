import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { updateSuggestionRuleStep } from "./steps/update-suggestion-rule";
import { invalidateSuggestionCacheStep } from "./steps/invalidate-suggestion-cache";
import { retrieveSuggestionRuleStep } from "./steps/retrieve-suggestion-rule";

/**
 * PUT /admin/suggestion-rules/:id (SRS §6.1). Update → invalidate cache → return
 * the full rule graph. Cache + retrieve consume the returned id so they order
 * strictly after the update step.
 */
export const updateSuggestionRuleWorkflow = createWorkflow(
  "update-suggestion-rule",
  (input: any) => {
    const ruleId = updateSuggestionRuleStep(input);
    invalidateSuggestionCacheStep({ ruleId });
    const suggestion_rule = retrieveSuggestionRuleStep({ id: ruleId });
    return new WorkflowResponse(suggestion_rule);
  },
);

export default updateSuggestionRuleWorkflow;
