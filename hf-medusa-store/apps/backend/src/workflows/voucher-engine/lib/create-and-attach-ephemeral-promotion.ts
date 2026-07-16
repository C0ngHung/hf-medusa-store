/**
 * createAndAttachEphemeralPromotion — shared "build ephemeral Promotion input
 * → create it → attach it to the cart" composition (Decision G, §14.2-A),
 * factored out of `apply-voucher.ts` and `revalidate-voucher-on-cart-change.ts`
 * (both previously copy-pasted this ~30-line block, differing only in the
 * `updateCartPromotionsWorkflow` step's `.config({name})` — kept as a caller
 * parameter since Medusa requires that name be unique only WITHIN one
 * workflow definition, so each caller keeps its own). A plain function
 * composing workflow-step calls, meant to be invoked directly inside another
 * workflow's composer body — not itself a step.
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
