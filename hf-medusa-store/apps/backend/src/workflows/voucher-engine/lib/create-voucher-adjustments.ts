/**
 * createVoucherLineItemAdjustments — shared "split final_voucher_discount
 * across eligible lines → write raw LineItemAdjustments" composition
 * (Decision-4 carrier rewrite), factored out for `apply-voucher.ts` and
 * `revalidate-voucher-on-cart-change.ts`. Supersedes
 * `create-and-attach-ephemeral-promotion.ts` (kept, marked superseded — not
 * deleted). A plain function composing workflow-step calls, meant to be
 * invoked directly inside another workflow's composer body — not itself a
 * step.
 */
import { transform, WorkflowData } from "@medusajs/framework/workflows-sdk";
import { splitAmountAcrossEligibleLines } from "../../../modules/voucher-engine/lib/calculate-discount";
import type { LineValue } from "../../../modules/voucher-engine/lib/calculate-discount";
import type { VoucherDiscountResult } from "../../../modules/voucher-engine/lib/calculate-discount";
import { createVoucherAdjustmentsStep } from "../steps/create-voucher-adjustments";

export function createVoucherLineItemAdjustments({
  lines,
  discount,
}: {
  lines: WorkflowData<LineValue[]> | LineValue[];
  discount: WorkflowData<VoucherDiscountResult>;
}) {
  const adjustmentsToCreate = transform(
    { lines, discount },
    ({ lines, discount }) =>
      splitAmountAcrossEligibleLines(
        lines,
        discount.final_voucher_discount,
      ).map((share) => ({ item_id: share.line_id, amount: share.amount })),
  );

  const created = createVoucherAdjustmentsStep({
    adjustments: adjustmentsToCreate,
  });

  return transform({ created }, ({ created }) => ({
    adjustment_ids: created.map((row) => row.id),
  }));
}
