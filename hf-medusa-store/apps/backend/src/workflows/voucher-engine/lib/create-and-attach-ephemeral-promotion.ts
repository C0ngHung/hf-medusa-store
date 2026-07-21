/**
 * SUPERSEDED (Decision-4 carrier rewrite, 2026-07-20) — kept, not deleted
 * (file deletion has been denied by this environment's permission system in
 * prior sessions), per this project's own precedent for superseded files
 * (e.g. `admin/steps/create-voucher.ts`).
 *
 * `createAndAttachEphemeralPromotion` built a fresh, cart-specific Promotion
 * to carry the voucher's discount (Decision G, §14.2-A). Verified against
 * installed 2.16.0 source that this mechanism structurally could not satisfy
 * the SRS's required stacking order once "item-level promotion" was
 * redefined to mean a native automatic Promotion Module adjustment
 * (Decision H-2): the ephemeral Promotion IS a Promotion, so it participates
 * in `PromotionModuleService.computeActions`'s shared, value-DESC-ordered
 * recompute alongside any coexisting automatic item-level Promotion — and
 * whichever one processes second has its OWN adjustment computed against an
 * already-reduced remaining amount (CONFLICT-8/PD-15).
 *
 * Replaced by `lib/create-voucher-adjustments.ts`'s
 * `createVoucherLineItemAdjustments`, which writes raw `LineItemAdjustment`
 * rows (`code`/`promotion_id` both `null`) instead of a Promotion. A
 * null-code adjustment is invisible to `computeActions`'s REMOVE-and-recompute
 * pass entirely (`isString(adjustment.code)` gate,
 * `@medusajs/promotion/dist/services/promotion-module.js:329`), so it can
 * never interfere with — or be interfered with by — an automatic Promotion's
 * own computation. See `steps/create-voucher-adjustments.ts`'s header for the
 * full verified-source citation trail.
 *
 * Unreferenced by `apply-voucher.ts`/`revalidate-voucher-on-cart-change.ts`
 * as of this rewrite — both now call `createVoucherLineItemAdjustments`.
 */
import { transform, WorkflowData } from "@medusajs/framework/workflows-sdk";
import {
  createPromotionsWorkflow,
  updateCartPromotionsWorkflow,
} from "@medusajs/core-flows";
import { PromotionActions } from "@medusajs/framework/utils";
import { generateEphemeralPromotionCode } from "./ephemeral-promotion";
import type { CartContext } from "../steps/load-cart-context";
import type { VoucherDiscountResult } from "../../../modules/voucher-engine/lib/calculate-discount";

/** @deprecated Superseded — see file header. Kept only because deletion is unavailable in this environment. */
export function createAndAttachEphemeralPromotion({
  cart_id,
  voucher_id,
  cart,
  discount,
  attachStepName,
}: {
  cart_id: WorkflowData<string> | string;
  voucher_id: WorkflowData<string> | string;
  cart: WorkflowData<CartContext>;
  discount: WorkflowData<VoucherDiscountResult>;
  attachStepName: string;
}) {
  const ephemeralInput = transform(
    { cart_id, voucher_id, cart, discount },
    ({ cart_id, voucher_id, cart, discount }) => ({
      promotionsData: [
        {
          code: generateEphemeralPromotionCode(cart_id, voucher_id),
          type: "standard" as const,
          status: "active" as const,
          is_automatic: false,
          application_method: {
            type: "fixed" as const,
            target_type: "items" as const,
            allocation: "across" as const,
            value: discount.final_voucher_discount,
            currency_code: cart.currency_code,
          },
        },
      ],
    }),
  );

  const createdPromotions = createPromotionsWorkflow.runAsStep({
    input: ephemeralInput,
  });

  const ephemeralPromotion = transform(
    { createdPromotions },
    ({ createdPromotions }) => ({
      id: createdPromotions[0].id,
      code: createdPromotions[0].code as string,
    }),
  );

  updateCartPromotionsWorkflow
    .runAsStep({
      input: transform(
        { cart_id, ephemeralPromotion },
        ({ cart_id, ephemeralPromotion }) => ({
          cart_id,
          promo_codes: [ephemeralPromotion.code],
          action: PromotionActions.ADD,
        }),
      ),
    })
    .config({ name: attachStepName });

  return ephemeralPromotion;
}
