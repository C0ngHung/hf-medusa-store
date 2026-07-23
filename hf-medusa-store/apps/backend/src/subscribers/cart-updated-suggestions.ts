import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { invalidateCartSuggestions } from "../lib/suggestion-cache";

/**
 * cart.updated → invalidate cart suggestions cache (SUGG-005 / SF-06 / KN-02,
 * tasks 2.6.1 / 2.6.2 / 2.6.6).
 *
 * On any cart mutation (item added / removed / quantity changed) we DELETE the
 * cart's cached suggestions immediately, so the next GET /store/carts/:id/
 * suggestions recomputes against fresh cart state (D7 — lazy re-evaluation, not an
 * eager recompute here).
 *
 * Boundaries:
 *  - Idempotent & failure-isolated: a cache error is logged (warn) and swallowed,
 *    never thrown — a subscriber failure must not affect the cart mutation.
 *  - Does NOT touch the voucher (KN-02): voucher revalidation runs synchronously
 *    inside the cart-mutation request, not from this async subscriber, to avoid a
 *    stale-total race and a `cart.updated` recursion loop.
 */
export default async function cartUpdatedSuggestionsHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const cartId = event.data?.id;
  if (!cartId) return;

  try {
    await invalidateCartSuggestions(container, cartId);
    logger.debug(
      `[suggestive] cart.updated → invalidated cart suggestions cache cart_id=${cartId}`,
    );
  } catch (err) {
    logger.warn(
      `[suggestive] cart.updated cache invalidation failed cart_id=${cartId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export const config: SubscriberConfig = {
  event: "cart.updated",
};
