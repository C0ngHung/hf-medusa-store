import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { createSuggestionEventsStep } from "./steps/create-suggestion-events";
import type { CreateSuggestionEventsInput } from "./types";

/**
 * createSuggestionEvents workflow — SUGG-006 / SPEC A.11 (infra for task 2.5.3).
 *
 * Thin wrapper over the single compensatable insert step so routes and other
 * workflows (dismissal, add-suggested-item) can record analytics uniformly. The
 * POST /store/suggestion-events route runs this in best-effort mode (202 Accepted).
 */
export const createSuggestionEventsWorkflow = createWorkflow(
  "create-suggestion-events",
  (input: CreateSuggestionEventsInput) => {
    const result = createSuggestionEventsStep(input);
    return new WorkflowResponse(result);
  },
);

export default createSuggestionEventsWorkflow;

export type {
  CreateSuggestionEventsInput,
  CreateSuggestionEventsResult,
  SuggestionEventInput,
} from "./types";
