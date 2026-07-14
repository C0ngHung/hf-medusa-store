import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { SUGGESTIVE_SELLING_MODULE } from "../modules/suggestive-selling";
import { CartEvaluationEngine } from "../modules/suggestive-selling/evaluator";
import {
  cache,
  cartCacheKey,
  getCartRuleVersion,
} from "../lib/suggestion-cache";
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

    // Versioned cart cache key (2.6.4/2.6.5): the cart-rule version namespaces the
    // key so an admin rule change bumps it and invalidates every cart at once;
    // `cart.updated` invalidates this exact key per cart (2.6.6).
    const cacheAdapter = cache(container);
    const cacheKey = cacheAdapter
      ? cartCacheKey(input.cartId, await getCartRuleVersion(container))
      : null;

    const engine = new CartEvaluationEngine({
      query,
      logger,
      suggestive,
      cache: cacheAdapter,
      cacheKey,
    });
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
