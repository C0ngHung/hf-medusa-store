/**
 * assertOrderHasVoucherStep — SPEC §11.4 step 1 (identity channel; task
 * 3.6.1). Resolves the voucher applied to an order via `order.metadata.voucher`
 * — NOT the order's adjustment ids, which (Decision-4 carrier rewrite) are
 * VoucherEngine's own raw, unlinked `LineItemAdjustment`s and don't map back
 * to `VoucherConfig` on their own.
 *
 * `order.metadata` is a copy of `cart.metadata` at completion (verified:
 * `@medusajs/core-flows/dist/cart/workflows/complete-cart.js:404`), so the
 * FULL audit snapshot `writeVoucherCartMetadataStep` wrote at apply/revalidate
 * time (§5.2/Decision D fields) survives onto the order untouched. This step
 * trusts that snapshot directly rather than re-deriving cap/subtotal figures
 * from current state: it was computed and written server-side by this module
 * alone, is never client-writable, and revalidation keeps it in sync with the
 * last-applied amount, so it is exactly the calculation basis that produced
 * the order's actual total.
 *
 * No voucher on the order → exit early (not an error) — most orders have no
 * voucher.
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  VOUCHER_METADATA_KEY,
  VoucherCartMetadata,
} from "../lib/ephemeral-promotion";

export const assertOrderHasVoucherStepId = "assert-order-has-voucher";

export interface AssertOrderHasVoucherInput {
  order_id: string;
}

export interface AssertOrderHasVoucherOutput {
  has_voucher: boolean;
  customer_id?: string;
  currency_code?: string;
  snapshot?: VoucherCartMetadata;
}

export const assertOrderHasVoucherStep = createStep(
  assertOrderHasVoucherStepId,
  async (input: AssertOrderHasVoucherInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY);

    const { data } = await query.graph({
      entity: "order",
      filters: { id: input.order_id },
      fields: ["id", "customer_id", "currency_code", "metadata"],
    });

    const order = data?.[0] as
      | {
          customer_id?: string | null;
          currency_code: string;
          metadata?: Record<string, unknown>;
        }
      | undefined;

    const snapshot = order?.metadata?.[VOUCHER_METADATA_KEY] as
      | VoucherCartMetadata
      | undefined;

    if (!order || !snapshot) {
      const output: AssertOrderHasVoucherOutput = { has_voucher: false };
      return new StepResponse(output);
    }

    const output: AssertOrderHasVoucherOutput = {
      has_voucher: true,
      customer_id: order.customer_id ?? "",
      currency_code: order.currency_code,
      snapshot,
    };
    return new StepResponse(output);
  },
  // Read-only — no compensation.
);
