/**
 * assertActiveVoucherStep — confirms the cart has an active voucher and
 * returns its ephemeral Promotion identity (SPEC §11.2/§11.10, Decision G).
 *
 * Reads `cart.metadata.voucher` (Decision G, §14.2-B) — NOT
 * `VoucherConfig.promotion_id`, which is the canonical/reference record and is
 * never attached to a cart. No active voucher is a no-op, not an error
 * (VOUCH-004 remove is idempotent) — the caller (`removeVoucherWorkflow`)
 * decides what "no-op" means for its own response.
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { VoucherCartMetadata } from "../lib/voucher-cart-metadata";
import { readVoucherCartMetadata } from "../lib/read-voucher-cart-metadata";

export const assertActiveVoucherStepId = "assert-active-voucher";

export interface AssertActiveVoucherInput {
  cart_id: string;
}

export interface AssertActiveVoucherOutput {
  active: VoucherCartMetadata | null;
  previous_metadata: Record<string, unknown> | null;
}

export const assertActiveVoucherStep = createStep(
  assertActiveVoucherStepId,
  async (input: AssertActiveVoucherInput, { container }) => {
    const { active, previous_metadata } = await readVoucherCartMetadata(
      container,
      input.cart_id,
    );

    const output: AssertActiveVoucherOutput = { active, previous_metadata };
    return new StepResponse(output);
  },
  // Read-only — no compensation.
);
