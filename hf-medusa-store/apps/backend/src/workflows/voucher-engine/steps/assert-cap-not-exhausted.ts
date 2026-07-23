/**
 * assertCapNotExhaustedStep — CR (2026-07-22) gate for `applyVoucherWorkflow`
 * only. Rejects the apply when `calculateVoucherDiscountStep` reports
 * `cap_exhausted_by_promotion: true` — item/automatic promotions ALONE
 * already consume the entire global cap, so the voucher would always resolve
 * to a 0đ discount. A deliberate override of SRS EC-03/§10.2's "always reduce
 * to 0, never reject" (see `lib/types.ts`'s `VoucherErrorCode` docstring) —
 * a "success" response that saves the customer nothing is more confusing
 * than a clear rejection.
 *
 * Deliberately its own step (not folded into `calculateVoucherDiscountStep`,
 * which stays a pure pass-through) so `resolveVoucherDiscountWorkflow`
 * (preview-only) and `revalidateVoucherWorkflow` (`cart.updated` subscriber,
 * which must never throw — see that workflow's header comment) are
 * unaffected; only the manual-apply flow opts into this rejection.
 */
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { throwVoucherError } from "../lib/errors";

export const assertCapNotExhaustedStepId = "assert-cap-not-exhausted";

export interface AssertCapNotExhaustedInput {
  cap_exhausted_by_promotion: boolean;
}

export const assertCapNotExhaustedStep = createStep(
  assertCapNotExhaustedStepId,
  async (input: AssertCapNotExhaustedInput) => {
    if (input.cap_exhausted_by_promotion) {
      throwVoucherError("VOUCHER_CAP_EXHAUSTED");
    }
    return new StepResponse({ ok: true });
  },
  // Read-only — no compensation.
);
