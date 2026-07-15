/**
 * writeVoucherCartMetadataStep — persists the auxiliary voucher snapshot (incl.
 * the ephemeral Promotion's own `{id, code}`) onto `cart.metadata.voucher`
 * (Decision G, §14.2-B). This is NEVER the authoritative discount amount
 * (Rule 18/INT-03) — it is operational data used to identify/detach the
 * ephemeral adjustment on remove/revalidate and to carry `voucher_id` forward
 * to `order.metadata` at redemption (§13.3).
 *
 * Compensation clears the key back to its previous value so a later step's
 * failure doesn't leave a snapshot pointing at a Promotion that was rolled
 * back by an earlier compensation.
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";
import type { ICartModuleService } from "@medusajs/framework/types";
import {
  VOUCHER_METADATA_KEY,
  VoucherCartMetadata,
} from "../lib/ephemeral-promotion";

export const writeVoucherCartMetadataStepId = "write-voucher-cart-metadata";

export interface WriteVoucherCartMetadataInput {
  cart_id: string;
  voucher: VoucherCartMetadata;
  /** Existing metadata, read earlier in the same workflow — merged, never overwritten wholesale. */
  previous_metadata?: Record<string, unknown> | null;
}

export const writeVoucherCartMetadataStep = createStep(
  writeVoucherCartMetadataStepId,
  async (input: WriteVoucherCartMetadataInput, { container }) => {
    const cartModuleService: ICartModuleService = container.resolve(
      Modules.CART,
    );

    await cartModuleService.updateCarts(input.cart_id, {
      metadata: {
        ...(input.previous_metadata ?? {}),
        [VOUCHER_METADATA_KEY]: input.voucher,
      },
    });

    return new StepResponse(
      { updated: true },
      { cart_id: input.cart_id, previous_metadata: input.previous_metadata },
    );
  },
  async (compensationInput, { container }) => {
    if (!compensationInput) return;
    const cartModuleService: ICartModuleService = container.resolve(
      Modules.CART,
    );
    await cartModuleService.updateCarts(compensationInput.cart_id, {
      metadata: { ...(compensationInput.previous_metadata ?? {}) },
    });
  },
);
