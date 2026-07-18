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
} from "../lib/voucher-cart-metadata";
import { VOUCHER_NOTICE_METADATA_KEY } from "../lib/auto-remove-notice";

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
        // A fresh successful apply/recompute supersedes any stale
        // VOUCHER_AUTO_REMOVED notice from an earlier auto-removal — `""` is
        // a merge-patch delete (see mergeMetadata finding in this file's
        // original header comment).
        [VOUCHER_NOTICE_METADATA_KEY]: "",
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
    // `updateCarts`'s `metadata` patch is a MERGE, not a replace (see
    // `2026-07-14-cart-metadata-merge-patch.md`) — omitting the voucher key
    // here would be a no-op and leave the just-written snapshot in place.
    // Explicitly restore the previous value, or clear it with `""` when there
    // was none, so a failed apply never leaves a stale voucher snapshot
    // pointing at a Promotion that compensation elsewhere rolled back.
    const previous = (compensationInput.previous_metadata ?? {}) as Record<
      string,
      unknown
    >;
    await cartModuleService.updateCarts(compensationInput.cart_id, {
      metadata: {
        ...previous,
        [VOUCHER_METADATA_KEY]: previous[VOUCHER_METADATA_KEY] ?? "",
        [VOUCHER_NOTICE_METADATA_KEY]:
          previous[VOUCHER_NOTICE_METADATA_KEY] ?? "",
      },
    });
  },
);
