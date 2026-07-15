/**
 * checkVoucherExistsStep — SPEC §11.3 step 1. Reads `cart.metadata.voucher`
 * (Decision G) so `revalidateVoucherWorkflow` can exit early via `when()` when
 * the cart has no active voucher — the common case for every ordinary cart
 * mutation.
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  VOUCHER_METADATA_KEY,
  VoucherCartMetadata,
} from "../lib/ephemeral-promotion";

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
    const query = container.resolve(ContainerRegistrationKeys.QUERY);

    const { data } = await query.graph({
      entity: "cart",
      filters: { id: input.cart_id },
      fields: ["id", "metadata"],
    });

    const cart = data?.[0] as
      | { metadata?: Record<string, unknown> }
      | undefined;
    const active = (cart?.metadata?.[VOUCHER_METADATA_KEY] ??
      null) as VoucherCartMetadata | null;

    const output: CheckVoucherExistsOutput = {
      has_voucher: !!active,
      active,
      previous_metadata: cart?.metadata ?? null,
    };
    return new StepResponse(output);
  },
  // Read-only — no compensation.
);
