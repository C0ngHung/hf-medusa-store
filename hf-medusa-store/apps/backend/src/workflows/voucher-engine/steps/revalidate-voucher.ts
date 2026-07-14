/**
 * revalidateStep — SPEC §11.3 step 3 (tasks 3.5.1, 3.5.7, 3.5.8). Re-runs the
 * cart-change validation SUBSET (V1, V2, V5, V6, V8 — §9.2) against the
 * latest voucher + cart state. Unlike `validateVoucherStep` (apply-time),
 * this NEVER throws — a failure means "auto-remove", not "abort the
 * workflow", so the result is a plain return value the workflow branches on.
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { toCartSnapshot, toVoucherSnapshot } from "../lib/mappers";
import type { PersistedVoucherConfig } from "../lib/mappers";
import { revalidateVoucherOnCartChange } from "../lib/revalidate-voucher";
import type { CartContext } from "./load-cart-context";
import { VOUCHER_ERRORS } from "../lib/errors";
import type { VoucherErrorCode } from "../lib/types";

export const revalidateStepId = "revalidate-voucher";

export interface RevalidateInput {
  voucher: PersistedVoucherConfig | null;
  cart: CartContext;
  now?: Date;
}

export interface RevalidateOutput {
  still_valid: boolean;
  failure_code?: VoucherErrorCode;
  failure_reason_vi?: string;
}

export const revalidateStep = createStep(
  revalidateStepId,
  async (input: RevalidateInput) => {
    const result = revalidateVoucherOnCartChange({
      voucher: input.voucher ? toVoucherSnapshot(input.voucher) : null,
      now: input.now ? new Date(input.now) : new Date(),
      cart: toCartSnapshot(input.cart),
      // V4 is skipped in this subset (§9.2) — the count is irrelevant here.
      user_usage_count: 0,
    });

    const output: RevalidateOutput = result.ok
      ? { still_valid: true }
      : {
          still_valid: false,
          failure_code: result.code,
          failure_reason_vi: VOUCHER_ERRORS[result.code].customer_message,
        };
    return new StepResponse(output);
  },
  // Read-only / pure — no compensation.
);
