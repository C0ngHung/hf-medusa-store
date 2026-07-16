/**
 * removeVoucherWorkflow — SPEC §11.2 (task 3.4.2, 3.4.10). Detaches the cart's
 * active voucher (ephemeral Promotion, Decision G) and clears the metadata
 * snapshot. No usage-count change (Rule 12/13) — applying/removing a voucher
 * on a cart never touches redemption accounting.
 *
 * No active voucher on the cart is a no-op (idempotent 200), not an error —
 * API_CONTRACT §1.3.
 */

import {
  WorkflowResponse,
  createWorkflow,
  transform,
  when,
} from "@medusajs/framework/workflows-sdk";
import {
  acquireLockStep,
  deletePromotionsWorkflow,
  releaseLockStep,
  updateCartPromotionsWorkflow,
} from "@medusajs/core-flows";
import { PromotionActions } from "@medusajs/framework/utils";
import type { ICartModuleService } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { assertActiveVoucherStep } from "./steps/assert-active-voucher";
import { refetchCartTotalStep } from "./steps/refetch-cart-total";
import { VOUCHER_METADATA_KEY } from "./lib/ephemeral-promotion";
import { VOUCHER_NOTICE_METADATA_KEY } from "./lib/auto-remove-notice";

export const removeVoucherWorkflowId = "remove-voucher";

export interface RemoveVoucherWorkflowInput {
  cart_id: string;
}

/**
 * Clears only the `voucher` key from `cart.metadata`, preserving everything
 * else.
 *
 * **Framework finding (this session):** `CartModuleService.updateCarts`'s
 * `metadata` patch is a MERGE-PATCH, not a replace — verified via
 * `@medusajs/utils/dist/common/merge-metadata.js` (`mergeMetadata`, used by
 * every `MedusaService`-based module's generic update path). A key absent
 * from the patch is preserved from the existing metadata untouched, so
 * omitting the `voucher` key (e.g. spreading everything else into a `rest`
 * object) is a NO-OP for that key, not a clear — confirmed empirically. Per
 * `mergeMetadata`'s own documented rule, a key is deleted ONLY when the patch
 * explicitly sets it to the empty string `""`.
 */
const clearVoucherCartMetadataStepId = "clear-voucher-cart-metadata";
const clearVoucherCartMetadataStep = createStep(
  clearVoucherCartMetadataStepId,
  async (input: { cart_id: string }, { container }) => {
    const cartModuleService: ICartModuleService = container.resolve(
      Modules.CART,
    );
    await cartModuleService.updateCarts(input.cart_id, {
      metadata: {
        [VOUCHER_METADATA_KEY]: "",
        [VOUCHER_NOTICE_METADATA_KEY]: "",
      },
    });
    return new StepResponse({ cleared: true });
  },
  // No compensation needed — clearing metadata has no downstream effect this
  // workflow depends on if a later step in this chain were to fail; the only
  // later step is releasing the lock.
);

export const removeVoucherWorkflow = createWorkflow(
  removeVoucherWorkflowId,
  (input: RemoveVoucherWorkflowInput) => {
    const lockKey = transform(
      { input },
      ({ input }) => `voucher:cart:${input.cart_id}`,
    );

    acquireLockStep({ key: lockKey, ttl: 10 });

    const assertion = assertActiveVoucherStep({ cart_id: input.cart_id });

    when({ assertion }, ({ assertion }) => !!assertion.active).then(() => {
      const code = transform(
        { assertion },
        ({ assertion }) => assertion.active!.ephemeral_code,
      );
      const promotionId = transform(
        { assertion },
        ({ assertion }) => assertion.active!.ephemeral_promotion_id,
      );

      updateCartPromotionsWorkflow.runAsStep({
        input: transform({ input, code }, ({ input, code }) => ({
          cart_id: input.cart_id,
          promo_codes: [code],
          action: PromotionActions.REMOVE,
        })),
      });

      deletePromotionsWorkflow.runAsStep({
        input: transform({ promotionId }, ({ promotionId }) => ({
          ids: [promotionId],
        })),
      });

      clearVoucherCartMetadataStep({ cart_id: input.cart_id });
    });

    releaseLockStep({ key: lockKey });

    // Refetch the authoritative cart total (whether or not there was
    // anything to remove — INT-03, never a captured/stale total).
    const refetched = refetchCartTotalStep({ cart_id: input.cart_id });

    return new WorkflowResponse(
      transform({ refetched }, ({ refetched }) => ({
        success: true as const,
        updated_cart_total: refetched.cart_total,
        message: "Đã gỡ mã giảm giá.",
      })),
    );
  },
);

export default removeVoucherWorkflow;
