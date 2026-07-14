import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { SUGGESTIVE_SELLING_MODULE } from "../modules/suggestive-selling";
import { CartEvaluationEngine } from "../modules/suggestive-selling/evaluator";
import type {
  CartEvaluationRequest,
  CartRawResult,
} from "../modules/suggestive-selling/types";

/**
 * evaluateCartSuggestions workflow — SRS §7.1, SPEC A.4/A.6 (task 2.4.1).
 *
 * Cart-level "You Might Also Need". A single read-only step (no compensation)
 * runs the CartEvaluationEngine: load the cart, fire the active cart rules
 * CR-01→CR-04, generate/enrich candidates, and project ≤3 unique suggestions
 * plus threshold_info. The route stays thin and calls this workflow (D7 —
 * synchronous & authoritative, not a subscriber).
 */
export interface EvaluateCartSuggestionsInput {
  cartId: string;
  request: CartEvaluationRequest;
}

const evaluateCartSuggestionsStep = createStep(
  "evaluate-cart-suggestions",
  async (input: EvaluateCartSuggestionsInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
    const suggestive = container.resolve(SUGGESTIVE_SELLING_MODULE);

    const engine = new CartEvaluationEngine({ query, logger, suggestive });
    const result = await engine.evaluateCart(input.cartId, input.request);

    return new StepResponse<CartRawResult>(result);
  },
);

export const evaluateCartSuggestionsWorkflow = createWorkflow(
  "evaluate-cart-suggestions",
  (input: EvaluateCartSuggestionsInput) => {
    const result = evaluateCartSuggestionsStep(input);
    return new WorkflowResponse(result);
  },
);

export default evaluateCartSuggestionsWorkflow;
