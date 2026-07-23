import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { retrieveSuggestionRuleStep } from "./steps/retrieve-suggestion-rule";

/** GET /admin/suggestion-rules/:id (SRS §6.1). */
export const getSuggestionRuleWorkflow = createWorkflow(
  "get-suggestion-rule",
  (input: { id: string }) => {
    const suggestion_rule = retrieveSuggestionRuleStep({ id: input.id });
    return new WorkflowResponse(suggestion_rule);
  },
);

export default getSuggestionRuleWorkflow;
