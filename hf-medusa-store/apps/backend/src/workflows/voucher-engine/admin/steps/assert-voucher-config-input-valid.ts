import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { MedusaError } from "@medusajs/framework/utils";
import {
  validateAttachVoucherConfigInput,
  type AttachVoucherConfigInputForValidation,
  type PromotionForAttachInputValidation,
} from "../lib/validate-attach-voucher-config-input";

/**
 * assertVoucherConfigInputValidStep — cross-field validation gate for
 * "Enable VoucherEngine on an existing Promotion" (2026-07-21 code-review
 * finding). Delegates to the pure, unit-tested
 * `validateAttachVoucherConfigInput` — see that file for the exact rules
 * (max_discount_amount only for percentage Promotions, must be less than
 * min_order_value).
 *
 * Runs AFTER `assertPromotionVoucherEligibleStep` (a different Promotion
 * itself IS/isn't voucher-eligible) and BEFORE `upsertLinkedVoucherConfigStep`
 * (never persist invalid VoucherEngine-owned input). Throws a plain
 * `MedusaError` (400 INVALID_DATA) — same admin-only error contract as the
 * eligibility step.
 */
export const assertVoucherConfigInputValidStepId =
  "assert-voucher-config-input-valid";

export interface AssertVoucherConfigInputValidInput {
  promotion: PromotionForAttachInputValidation;
  input: AttachVoucherConfigInputForValidation;
}

export const assertVoucherConfigInputValidStep = createStep(
  assertVoucherConfigInputValidStepId,
  async (input: AssertVoucherConfigInputValidInput) => {
    const result = validateAttachVoucherConfigInput(
      input.promotion,
      input.input,
    );
    if (!result.ok) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, result.message);
    }

    return new StepResponse(true);
  },
  // Read-only step — no compensation.
);

export default assertVoucherConfigInputValidStep;
