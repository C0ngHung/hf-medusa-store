import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { revalidateVoucherWorkflow } from "../workflows/voucher-engine/revalidate-voucher-on-cart-change";

/**
 * cart.updated → revalidate the cart's active voucher (SPEC §11.3/§11.5/§13.1;
 * tasks 3.5.1, 3.5.7, 3.5.8).
 *
 * Covers cart mutations VoucherEngine does NOT own (item add/remove, quantity
 * change, suggestive-selling adds) — for voucher-owned mutations
 * (apply/remove themselves), `applyVoucherWorkflow`'s own `verifyCartTotalsStep`
 * already reconciles the cart synchronously in the same request; this
 * subscriber is the async half for everything else (§11.5 table).
 *
 * Failure-isolated: a revalidation error is logged and swallowed, never
 * thrown — a subscriber failure must not affect the (already-completed) cart
 * mutation that triggered it. `revalidateVoucherWorkflow` itself is a no-op
 * when the cart has no active voucher (the common case for most mutations).
 *
 * Loop-guard: `revalidateVoucherWorkflow` only mutates the cart (and could
 * therefore re-emit `cart.updated`) when the recomputed voucher amount
 * actually differs from what's already applied, or the voucher becomes
 * invalid — an unchanged-amount revalidation performs no write, so a
 * self-triggered echo converges after one pass (§11.5).
 */
export default async function voucherCartUpdatedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const cartId = event.data?.id;
  if (!cartId) return;

  try {
    await revalidateVoucherWorkflow(container).run({
      input: { cart_id: cartId },
    });
  } catch (err) {
    logger.warn(
      `[voucher-engine] cart.updated revalidation failed cart_id=${cartId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export const config: SubscriberConfig = {
  event: "cart.updated",
};
