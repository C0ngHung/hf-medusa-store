/**
 * SUPERSEDED (Decision-4 carrier rewrite, 2026-07-20) — kept, not deleted
 * (file deletion has been denied by this environment's permission system in
 * prior sessions). No longer called by `record-voucher-usage.ts`: the
 * current carrier (raw `LineItemAdjustment` rows, `create-voucher-adjustments.ts`)
 * has no standalone entity to clean up post-redemption — see that
 * workflow's header for the full explanation. Left here only in case any
 * legacy pre-rewrite cart/order still references an ephemeral Promotion id.
 *
 * cleanupEphemeralPromotionStep — Backend-5B-1 (SPEC Decision G, §14.2-A).
 *
 * Deletes (soft-deletes, per installed `deletePromotionsWorkflow` →
 * `PromotionModuleService.softDeletePromotions` — verified against
 * `@medusajs/core-flows/dist/promotion/steps/delete-promotions.js`) the
 * ephemeral, cart-specific Promotion that carried a voucher's discount, once
 * redemption is durably recorded (the caller must only invoke this once a
 * `VoucherUsageLog` row is confirmed to exist for this order — this step
 * does not itself re-check that).
 *
 * Deleting it is safe for order data: `OrderLineItemAdjustment.promotion_id`
 * is a plain `model.text().nullable()` column, not a relation to Promotion
 * (verified: `@medusajs/order/dist/models/line-item-adjustment.js` — its
 * only `belongsTo` is `item`) — so order adjustments/totals never depend on
 * the Promotion row still existing.
 *
 * Strictly non-fatal by design: this step NEVER throws. A missing
 * `ephemeral_promotion_id` (no-op), an already-deleted/missing Promotion, or
 * any other unexpected delete failure are all caught, logged, and reported
 * via the output — never propagated — so a redemption that has already
 * committed (`atomicRedeemStep`'s usage_count increment + VoucherUsageLog
 * insert, which itself has no compensation and must never be rolled back)
 * can never be undone by a cleanup problem downstream of it.
 */

import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { deletePromotionsWorkflow } from "@medusajs/core-flows";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { MedusaContainer } from "@medusajs/framework/types";

export const cleanupEphemeralPromotionStepId = "cleanup-ephemeral-promotion";

export interface CleanupEphemeralPromotionInput {
  /** Absent when there is nothing to clean up (no voucher / no ephemeral promotion recorded). */
  ephemeral_promotion_id?: string;
}

export interface CleanupEphemeralPromotionOutput {
  /** True whenever a deletion was attempted (an id was present). */
  attempted: boolean;
  /** True only when the delete call itself completed without error. */
  deleted: boolean;
}

export const cleanupEphemeralPromotionStep = createStep(
  cleanupEphemeralPromotionStepId,
  async (
    input: CleanupEphemeralPromotionInput,
    { container }: { container: MedusaContainer },
  ) => {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER);

    if (!input.ephemeral_promotion_id) {
      const output: CleanupEphemeralPromotionOutput = {
        attempted: false,
        deleted: false,
      };
      return new StepResponse(output);
    }

    try {
      await deletePromotionsWorkflow(container).run({
        input: { ids: [input.ephemeral_promotion_id] },
      });
      const output: CleanupEphemeralPromotionOutput = {
        attempted: true,
        deleted: true,
      };
      return new StepResponse(output);
    } catch (err) {
      // Non-fatal: an already-deleted/missing Promotion, or any other
      // failure here, must never fail the redemption workflow or imply the
      // committed usage_count/VoucherUsageLog should be reconsidered.
      logger.warn(
        `[voucher-engine] ephemeral Promotion cleanup failed (non-fatal, redemption already recorded) ${JSON.stringify(
          {
            promotion_id: input.ephemeral_promotion_id,
            error: err instanceof Error ? err.message : String(err),
          },
        )}`,
      );
      const output: CleanupEphemeralPromotionOutput = {
        attempted: true,
        deleted: false,
      };
      return new StepResponse(output);
    }
  },
  // No compensation — this step itself never throws (see above), so the
  // engine never has anything to compensate; it also must never be the
  // trigger for undoing the earlier, already-committed redemption.
);
