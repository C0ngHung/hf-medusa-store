/**
 * validateVoucherStep — real V1-V8 gate wired to DB + Cart data (SPEC §11.10
 * `validateVoucherStep`, adapted; Phase-3 items 3/4/5/6).
 *
 * Thin I/O wrapper around the pure `validateVoucher()` chain
 * (lib/validate-voucher.ts): maps the persisted voucher row + the authoritative
 * `CartContext` (loadCartContextStep) to the chain's plain-data snapshots via
 * `lib/mappers.ts`, runs the fail-fast V1-V8 gate, and throws
 * `VoucherValidationError` on the first failure — including V6
 * `VOUCHER_NO_ELIGIBLE_ITEMS` (Phase-3 item 6: "no eligible items produces the
 * approved business failure"). No I/O of its own beyond what its inputs already
 * carry; no compensation needed (nothing is mutated before this gate passes).
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { VoucherValidationError } from "../lib/errors";
import { toCartSnapshot, toVoucherSnapshot } from "../lib/mappers";
import type { PersistedVoucherConfig } from "../lib/mappers";
import { validateVoucher } from "../lib/validate-voucher";
import type { CartContext } from "./load-cart-context";
import type { CustomerSegmentSnapshot } from "../lib/types";

export const validateVoucherStepId = "validate-voucher";

export interface ValidateVoucherInput {
  voucher: PersistedVoucherConfig | null;
  cart: CartContext;
  user_usage_count: number;
  /** V7 — pre-resolved by `loadCustomerSegmentStep` (SPEC Decision J). */
  customer_segment: CustomerSegmentSnapshot;
  /** Reference time for V2 (SPEC: pure chain never reads the clock itself). Defaults to now. */
  now?: Date;
}

export interface ValidateVoucherOutput {
  valid: true;
}

export const validateVoucherStep = createStep(
  validateVoucherStepId,
  async (input: ValidateVoucherInput) => {
    const result = validateVoucher({
      voucher: input.voucher ? toVoucherSnapshot(input.voucher) : null,
      now: input.now ? new Date(input.now) : new Date(),
      cart: toCartSnapshot(input.cart),
      user_usage_count: input.user_usage_count,
      customer_segment: input.customer_segment,
    });

    if (!result.ok) {
      throw new VoucherValidationError(result);
    }

    const output: ValidateVoucherOutput = { valid: true };
    return new StepResponse(output);
  },
  // Read-only / pure — no compensation.
);
