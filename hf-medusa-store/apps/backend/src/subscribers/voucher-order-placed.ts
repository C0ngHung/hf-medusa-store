import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { recordVoucherUsageWorkflow } from "../workflows/voucher-engine/record-voucher-usage";

/**
 * order.placed → record voucher redemption usage (SPEC §11.4/§13.2/§13.3;
 * tasks 3.6.1, 3.6.4, 3.6.5, 3.6.7).
 *
 * This is the PRIMARY (only) redemption trigger this session — not a
 * fallback. `completeCartWorkflow` exposes no supported "after order
 * created" hook receiving the order id (verified against installed
 * @medusajs/core-flows 2.16.0: only a pre-execution `validate` hook exists;
 * the internal `orderCreated` hook is not surfaced in the workflow's public
 * `WorkflowResponse.hooks`), so per SPEC §13.3's own documented contingency
 * this subscriber is promoted to primary. `recordVoucherUsageWorkflow` itself
 * is idempotent (pre-check + durable unique DB index, §14.3), so duplicate
 * event delivery is safe, and this handler never throws — errors are caught
 * and logged (async, non-blocking; the order has already been placed and
 * paid, so a redemption-recording failure must not surface to the customer).
 */
export default async function voucherOrderPlacedHandler({
  event,
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const orderId = event.data?.id;
  if (!orderId) return;

  try {
    await recordVoucherUsageWorkflow(container).run({
      input: { order_id: orderId },
    });
  } catch (err) {
    logger.error(
      `[voucher-engine] order.placed usage recording failed order_id=${orderId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
