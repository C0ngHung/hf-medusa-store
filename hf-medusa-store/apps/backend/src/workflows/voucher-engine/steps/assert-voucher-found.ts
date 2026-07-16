/**
 * assertVoucherFoundStep — early V1-existence gate for apply-voucher.
 *
 * Runs BEFORE checkActiveVoucherStep so a nonexistent/mistyped code always
 * 404s, even when the cart already has a different voucher active — without
 * this, checkActiveVoucherStep's replace-confirmation gate (which never sees
 * `code`) fires first and asks the customer to "replace" a code that was
 * never valid in the first place.
 */
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { throwVoucherError } from "../lib/errors";
import type { PersistedVoucherConfig } from "../lib/mappers";

export const assertVoucherFoundStepId = "assert-voucher-found";

export interface AssertVoucherFoundInput {
  voucher: PersistedVoucherConfig | null;
}

export const assertVoucherFoundStep = createStep(
  assertVoucherFoundStepId,
  async (input: AssertVoucherFoundInput) => {
    if (!input.voucher) {
      throwVoucherError("VOUCHER_NOT_FOUND");
    }
    return new StepResponse({ ok: true });
  },
  // Read-only — no compensation.
);
