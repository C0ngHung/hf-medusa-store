/**
 * checkVoucherExistsStep — SPEC §11.3 step 1. Reads `cart.metadata.voucher`
 * (Decision G) so `revalidateVoucherWorkflow` can exit early via `when()` when
 * the cart has no active voucher — the common case for every ordinary cart
 * mutation.
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { VoucherCartMetadata } from "../lib/ephemeral-promotion";
import { readVoucherCartMetadata } from "../lib/read-voucher-cart-metadata";

export const checkVoucherExistsStepId = "check-voucher-exists";

export interface CheckVoucherExistsInput {
  cart_id: string;
}

export interface CheckVoucherExistsOutput {
  has_voucher: boolean;
  active: VoucherCartMetadata | null;
  previous_metadata: Record<string, unknown> | null;
}

export const checkVoucherExistsStep = createStep(
  checkVoucherExistsStepId,
  async (input: CheckVoucherExistsInput, { container }) => {
    const { active, previous_metadata } = await readVoucherCartMetadata(
      container,
      input.cart_id,
    );

    const output: CheckVoucherExistsOutput = {
      has_voucher: !!active,
      active,
      previous_metadata,
    };
    return new StepResponse(output);
  },
  // Read-only — no compensation.
);
