import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { softDeleteSuggestionRuleStep } from "./steps/soft-delete-suggestion-rule";
import { invalidateSuggestionCacheStep } from "./steps/invalidate-suggestion-cache";

/**
 * DELETE /admin/suggestion-rules/:id (SRS §6.1) — soft delete → invalidate cache.
 */
export const deleteSuggestionRuleWorkflow = createWorkflow(
  "delete-suggestion-rule",
  (input: { id: string }) => {
    const ruleId = softDeleteSuggestionRuleStep({ id: input.id });
    invalidateSuggestionCacheStep({ ruleId });
    return new WorkflowResponse(ruleId);
  },
);

export default deleteSuggestionRuleWorkflow;
