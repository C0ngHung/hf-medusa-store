/**
 * createVoucherAdjustmentsStep — Decision-4 carrier rewrite (raw
 * `LineItemAdjustment`s, not a Promotion).
 *
 * Verified against installed @medusajs/{cart,promotion,utils,core-flows}
 * 2.16.0 source that a `code: null` / `promotion_id: null` line item
 * adjustment is the correct discount carrier for VoucherEngine, replacing the
 * ephemeral-Promotion mechanism (`lib/create-and-attach-ephemeral-promotion.ts`,
 * superseded):
 *
 *  - `PromotionModuleService.computeActions` only tracks adjustments whose
 *    `code` is a string (`isString(adjustment.code)` gate,
 *    `@medusajs/promotion/dist/services/promotion-module.js:329`) when
 *    building the REMOVE-and-recompute set for a cart mutation — a
 *    null-code adjustment is invisible to it: never removed, never seeded
 *    into the shared `appliedPromotionsMap`.
 *  - A cart line's `subtotal` (the base `computeActions` computes automatic
 *    item-level Promotions against) is always the GROSS `unit_price *
 *    quantity` — adjustments reduce `total`, never `subtotal`
 *    (`@medusajs/utils/dist/totals/line-item/index.js:43-50,85-86`). So an
 *    automatic item-level Promotion's own discount can never be reduced by a
 *    coexisting VoucherEngine adjustment, in EITHER temporal order — this is
 *    what makes the SRS-required order (item promotions apply first and are
 *    never reduced/recomputed, voucher applies after) actually hold, closing
 *    the CONFLICT-8/PD-15 gap the old ephemeral-Promotion carrier could not
 *    close (that carrier WAS a Promotion, so it participated in the shared
 *    `computeActions` value-DESC recompute and could shrink a coexisting
 *    automatic Promotion's own adjustment).
 *  - `LineItemAdjustment.code`/`promotion_id` are both `model.text().nullable()`
 *    (`@medusajs/cart/dist/models/line-item-adjustment.js`).
 *  - `calculateAdjustmentTotal` (`@medusajs/utils/dist/totals/adjustment/index.js`)
 *    sums every adjustment on a line unconditionally (no `code`/`promotion_id`
 *    filter) into `item.total`/`discount_total` — so the cart's own
 *    authoritative total picks up this adjustment exactly like a Promotion's.
 *  - `complete-cart.js` copies `item.adjustments` verbatim onto the created
 *    order's line items regardless of `code` — the discount and the receipt
 *    record survive checkout unchanged; `registerUsageStep`'s
 *    `PromotionModuleService.registerUsage` filters computed actions by
 *    `.filter(Boolean)` on `code` first, so a null-code entry is silently
 *    skipped (no bogus registration attempt, no error).
 *
 * Not reused from `@medusajs/core-flows`'s own `createLineItemAdjustmentsStep`:
 * that step's successful `StepResponse` returns `void 0` as its OWN output
 * (the created rows are only the compensation payload) — this step needs the
 * created ids back (to record in `cart.metadata.voucher.adjustment_ids` and to
 * target them later on remove/replace/verify), so it wraps
 * `ICartModuleService.addLineItemAdjustments` directly instead, mirroring the
 * same soft-delete compensation.
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";
import type { ICartModuleService } from "@medusajs/framework/types";

export const createVoucherAdjustmentsStepId = "create-voucher-adjustments";

/** Marks a VoucherEngine-owned adjustment for humans reading the DB/admin — never used for matching (ids are). */
export const VOUCHER_ADJUSTMENT_DESCRIPTION = "voucher-engine" as const;

export interface VoucherAdjustmentToCreate {
  item_id: string;
  /** Integer VND (INT-01) — this line's share of `final_voucher_discount` (`splitAmountAcrossEligibleLines`). */
  amount: number;
}

export interface CreateVoucherAdjustmentsInput {
  adjustments: VoucherAdjustmentToCreate[];
}

export interface CreatedVoucherAdjustment {
  id: string;
  item_id: string;
}

export const createVoucherAdjustmentsStep = createStep(
  createVoucherAdjustmentsStepId,
  async (input: CreateVoucherAdjustmentsInput, { container }) => {
    const nonZero = input.adjustments.filter((a) => a.amount > 0);
    if (!nonZero.length) {
      return new StepResponse([] as CreatedVoucherAdjustment[], []);
    }

    const cartModuleService: ICartModuleService = container.resolve(
      Modules.CART,
    );

    // `code`/`promotion_id` are omitted (nullable columns, see file header) —
    // the exported `CreateLineItemAdjustmentDTO` type declares `code` as a
    // required `string`, which does not match the model's own nullable
    // column; casting through `unknown` documents that known type/runtime gap
    // rather than fabricating a placeholder code that would make this
    // adjustment visible to `computeActions` again.
    const created = await cartModuleService.addLineItemAdjustments(
      nonZero.map((a) => ({
        item_id: a.item_id,
        amount: a.amount,
        description: VOUCHER_ADJUSTMENT_DESCRIPTION,
      })) as unknown as Parameters<
        ICartModuleService["addLineItemAdjustments"]
      >[0],
    );

    const output: CreatedVoucherAdjustment[] = created.map((row: any) => ({
      id: row.id,
      item_id: row.item_id,
    }));

    return new StepResponse(
      output,
      output.map((row) => row.id),
    );
  },
  async (createdIds, { container }) => {
    if (!createdIds?.length) return;
    const cartModuleService: ICartModuleService = container.resolve(
      Modules.CART,
    );
    await cartModuleService.softDeleteLineItemAdjustments(createdIds);
  },
);
