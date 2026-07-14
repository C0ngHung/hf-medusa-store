import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { addToCartWorkflow } from "@medusajs/medusa/core-flows";
import { createSuggestionEventsStep } from "../suggestion-event/steps/create-suggestion-events";
import { prepareSuggestedItemStep } from "./steps/prepare-suggested-item";
import type { AddSuggestedItemInput } from "./steps/prepare-suggested-item";
import { loadSuggestedItemResultStep } from "./steps/load-suggested-item-result";

/**
 * addSuggestedItemWorkflow (`add-suggested-item`) — one-tap add with attribution
 * (SUGG-003, API Contract §1.1 / §7). Composition:
 *   prepare (validate attribution + resolve variant + idempotency lookup)
 *   → when NOT a replay: addToCartWorkflow (core, re-checks stock authoritatively
 *     + prices the line) with attribution metadata, then emit add_to_cart event
 *     (best-effort)
 *   → load the resulting line item + authoritative cart total.
 *
 * Cache invalidation is handled by the existing `cart.updated` subscriber
 * (addToCart emits cart.updated → invalidateCartSuggestions), so no explicit
 * invalidation step here.
 */
export const addSuggestedItemWorkflow = createWorkflow(
  "add-suggested-item",
  (input: AddSuggestedItemInput) => {
    const prepared = prepareSuggestedItemStep(input);

    when({ prepared }, ({ prepared }) => !prepared.is_replay).then(() => {
      const addInput = transform(
        { input, prepared },
        ({ input, prepared }) => ({
          cart_id: input.cart_id,
          items: [prepared.add_item!],
        }),
      );
      addToCartWorkflow.runAsStep({ input: addInput });

      const eventsInput = transform({ prepared }, ({ prepared }) => ({
        events: [prepared.event!],
        best_effort: true,
      }));
      createSuggestionEventsStep(eventsInput);
    });

    const result = loadSuggestedItemResultStep(
      transform({ input, prepared }, ({ input, prepared }) => ({
        cart_id: input.cart_id,
        idempotency_key: input.idempotency_key,
        is_replay: prepared.is_replay,
      })),
    );

    return new WorkflowResponse(result);
  },
);

export default addSuggestedItemWorkflow;
