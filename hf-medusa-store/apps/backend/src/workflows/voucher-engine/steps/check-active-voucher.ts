/**
 * checkActiveVoucherStep — reads the cart's active-voucher snapshot from
 * `cart.metadata.voucher` (Decision G, §14.2-B) and enforces the one-active-
 * voucher / replace-confirmation rule (tasks 3.4.6/3.4.7/3.4.8, SPEC §11.1
 * replace note).
 *
 * Read-only: does not mutate anything. Throws `VOUCHER_REPLACE_REQUIRED`
 * (409) when another voucher is already active and the caller has not passed
 * `replace: true` — this must happen BEFORE any new Promotion is created or
 * attached (Rule: never remove a valid existing voucher before the
 * replacement is validated).
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { VoucherCartMetadata } from "../lib/voucher-cart-metadata";
import { throwVoucherError } from "../lib/errors";
import { readVoucherCartMetadata } from "../lib/read-voucher-cart-metadata";

export const checkActiveVoucherStepId = "check-active-voucher";

export interface CheckActiveVoucherInput {
  cart_id: string;
  replace?: boolean;
}

export interface CheckActiveVoucherOutput {
  /** The previously-active voucher's ephemeral promotion, if any — used to swap it out AFTER the new one is verified. */
  previous: VoucherCartMetadata | null;
  /** The cart's full raw metadata object (not just the `voucher` key) — the write step merges onto this so unrelated keys survive. */
  previous_metadata: Record<string, unknown> | null;
}

export const checkActiveVoucherStep = createStep(
  checkActiveVoucherStepId,
  async (input: CheckActiveVoucherInput, { container }) => {
    const { active: existing, previous_metadata } =
      await readVoucherCartMetadata(container, input.cart_id);

    if (existing && input.replace !== true) {
      throwVoucherError("VOUCHER_REPLACE_REQUIRED", {
        current_code: existing.code,
      });
    }

    const output: CheckActiveVoucherOutput = {
      previous: existing,
      previous_metadata,
    };
    return new StepResponse(output);
  },
  // Read-only — no compensation.
);
