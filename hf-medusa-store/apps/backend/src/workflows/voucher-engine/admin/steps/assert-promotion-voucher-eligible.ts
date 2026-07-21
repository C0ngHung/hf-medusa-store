import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { MedusaError } from "@medusajs/framework/utils";
import {
  checkPromotionVoucherEligibility,
  type PromotionForEligibilityCheck,
} from "../lib/check-promotion-voucher-eligibility";

/**
 * assertPromotionVoucherEligibleStep — the eligibility gate for "Enable
 * VoucherEngine on an existing Promotion" (Admin unified model). Delegates
 * entirely to the pure, unit-tested `checkPromotionVoucherEligibility`
 * (`admin/lib/check-promotion-voucher-eligibility.ts`) — every rule here
 * depends only on the Promotion object itself (`is_automatic`, code,
 * `VEPH-*`, target type, status, Campaign expiry).
 *
 * Does NOT check for an existing linked VoucherConfig — Enable is now an
 * idempotent create-or-reactivate-or-update operation
 * (`upsertLinkedVoucherConfigStep`), so a Promotion that already has a
 * linked (enabled OR disabled) VoucherConfig is still eligible; the upsert
 * step decides whether to create, reactivate, or update in place. The
 * DB-level partial unique index on `voucher_config.promotion_id`
 * (Migration20260720120000) remains the real guarantee against a
 * concurrent-create race producing two rows for the same Promotion.
 *
 * Throws a plain `MedusaError` on any failure — this is an ADMIN-only
 * operation (merchant configuring a Promotion), not the customer-facing
 * V1-V8 store pipeline in `lib/errors.ts` (which has its own Vietnamese
 * customer-message contract, SPEC §8.3). Reusing that catalog here would
 * conflate two different audiences and error contracts.
 */
export const assertPromotionVoucherEligibleStepId =
  "assert-promotion-voucher-eligible";

export interface AssertPromotionVoucherEligibleInput {
  promotion: PromotionForEligibilityCheck;
}

export const assertPromotionVoucherEligibleStep = createStep(
  assertPromotionVoucherEligibleStepId,
  async (input: AssertPromotionVoucherEligibleInput) => {
    const result = checkPromotionVoucherEligibility(input.promotion);
    if (!result.eligible) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, result.reason);
    }

    return new StepResponse(true);
  },
  // Read-only step — no compensation.
);

export default assertPromotionVoucherEligibleStep;
