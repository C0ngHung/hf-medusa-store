import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { listSuggestionRulesStep } from "./steps/list-suggestion-rules";

/** GET /admin/suggestion-rules (SRS §6.1). */
export const listSuggestionRulesWorkflow = createWorkflow(
  "list-suggestion-rules",
  (input: { filters: Record<string, unknown>; take: number; skip: number }) => {
    const result = listSuggestionRulesStep(input);
    return new WorkflowResponse(result);
  },
);

export default listSuggestionRulesWorkflow;
