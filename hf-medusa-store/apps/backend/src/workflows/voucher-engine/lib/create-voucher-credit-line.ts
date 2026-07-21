/**
 * createVoucherCreditLine — carries the cap-adjusted voucher discount into the
 * authoritative Cart/Order totals via a `cart.credit_lines` entry (Option-B
 * carrier; supersedes the ephemeral-Promotion carrier of Decision G).
 *
 * WHY a credit line and not a Promotion (the CONFLICT-8 / PD-15 fix):
 * a credit line is NOT a promotion — it never enters the Promotion module's
 * `computeActions`, so it cannot re-sort or re-compound with a coexisting
 * item-level percentage promotion. That preserves Rule 11 (item-promotion
 * discount is never reduced by VoucherEngine) by construction, which the
 * ephemeral fixed-Promotion carrier provably violated. The credit line reduces
 * `cart.total` (verified `@medusajs/utils/dist/totals/cart/index.js:112`:
 * `total = subtotal + taxTotal − discountSubtotal − creditLinesTotal`) and is
 * copied onto the order at completion (`complete-cart.js:361-406`).
 *
 * Amount source: `discount.final_voucher_discount` — the StackingEngine's
 * already-capped integer VND amount (§10). This helper is pure transport; it
 * performs no monetary arithmetic. A plain composition function meant to be
 * called inside another workflow's composer body — not itself a step.
 *
 * NOTE (tax assumption): credit lines net AFTER tax. Valid while the store has
 * no tax rates (VND, 0 rates today). If tax is ever configured, revisit the
 * discount basis (see plan §Risks / SPEC PD-15).
 */
import { transform, WorkflowData } from "@medusajs/framework/workflows-sdk";
import { createCartCreditLinesWorkflow } from "@medusajs/core-flows";
import type { VoucherDiscountResult } from "../../../modules/voucher-engine/lib/calculate-discount";

/** `reference` stamped on the voucher credit line so it can be identified/detached. */
export const VOUCHER_CREDIT_LINE_REFERENCE = "voucher" as const;

export function createVoucherCreditLine({
  cart_id,
  voucher_id,
  code,
  discount,
}: {
  cart_id: WorkflowData<string> | string;
  voucher_id: WorkflowData<string> | string;
  code: WorkflowData<string> | string;
  discount: WorkflowData<VoucherDiscountResult>;
}) {
  const input = transform(
    { cart_id, voucher_id, code, discount },
    ({ cart_id, voucher_id, code, discount }) => [
      {
        cart_id,
        amount: discount.final_voucher_discount,
        reference: VOUCHER_CREDIT_LINE_REFERENCE,
        reference_id: voucher_id,
        metadata: { voucher_id, code },
      },
    ],
  );

  const createdCreditLines = createCartCreditLinesWorkflow.runAsStep({ input });

  return transform({ createdCreditLines }, ({ createdCreditLines }) => ({
    credit_line_id: createdCreditLines[0].id as string,
  }));
}
