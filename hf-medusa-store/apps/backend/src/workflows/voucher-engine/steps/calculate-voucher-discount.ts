/**
 * calculateVoucherDiscountStep — thin step wrapper around the pure
 * `calculateVoucherDiscount()` (SPEC §11.10 `calculateVoucherDiscountStep`,
 * adapted to also fold in `enforceGlobalCapStep` — the existing pure function
 * already fuses per-voucher cap + global cap in one deterministic pass, so this
 * step does not re-split them; see `lib/calculate-discount.ts` header).
 *
 * Pure/no I/O: exists as its own step (rather than inline `transform()`) so the
 * SPEC's step-contract naming is preserved and the calculation stays
 * independently traceable in the workflow graph (Phase-3 item 9/10).
 *
 * Deliberately does NOT throw on `result.cap_exhausted_by_promotion` here —
 * this step is shared by `applyVoucherWorkflow` (manual apply, where a CR
 * 2026-07-22 now rejects this case — see `apply-voucher.ts`),
 * `resolveVoucherDiscountWorkflow` (preview-only), and
 * `revalidateVoucherWorkflow` (`cart.updated` subscriber, which must never
 * throw — an already-applied voucher losing all cap capacity there should
 * flow through that workflow's own auto-remove path, not abort here). Callers
 * that want the CR's reject behavior check the flag themselves.
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import {
  LineValue,
  VoucherDiscountResult,
  calculateVoucherDiscount,
} from "../../../modules/voucher-engine/lib/calculate-discount";
import type { PersistedVoucherConfig } from "../lib/mappers";

export const calculateVoucherDiscountStepId = "calculate-voucher-discount";

export interface CalculateVoucherDiscountInput {
  lines: LineValue[];
  voucher: Pick<
    PersistedVoucherConfig,
    "discount_type" | "discount_value" | "max_discount_amount"
  >;
  /** VOUCH-003 — resolved server-side by `lookupVoucherStep` (task 3.3.10). */
  global_cap_bps: number;
  /** Cart's current authoritative shipping fee (0 when no shipping method selected yet). */
  shipping_total: number;
}

export const calculateVoucherDiscountStep = createStep(
  calculateVoucherDiscountStepId,
  async (input: CalculateVoucherDiscountInput) => {
    const result: VoucherDiscountResult = calculateVoucherDiscount({
      lines: input.lines,
      discount_type: input.voucher.discount_type,
      discount_value: input.voucher.discount_value,
      max_discount_amount: input.voucher.max_discount_amount,
      global_cap_bps: input.global_cap_bps,
      shipping_total: input.shipping_total,
    });

    return new StepResponse(result);
  },
  // Pure/deterministic — no compensation needed.
);
