import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { MedusaError, Modules } from "@medusajs/framework/utils";
import type { IPromotionModuleService } from "@medusajs/framework/types";

/**
 * loadPromotionForAttachStep — "Enable VoucherEngine on an existing
 * Promotion" (Admin unified model, `POST
 * /admin/promotions/:promotion_id/voucher-config`).
 *
 * Reads the canonical Promotion + its `application_method` + linked
 * `campaign` via the real Promotion Module service (not `query.graph` —
 * verified in this same rebuild that `query.graph` on entities with
 * computed/relation data can silently omit fields the module service
 * returns correctly; `steps/verify-cart-totals.ts`'s file header documents
 * the same finding for Cart totals).
 *
 * `campaign` (NOT `campaign.budget` — dropped 2026-07-21) is still needed
 * here: `checkPromotionVoucherEligibility` (called next, on this same
 * `promotion` object) reads `campaign.ends_at` to reject enabling
 * VoucherEngine on an already-expired Campaign. `campaign.budget` is no
 * longer requested — `usage_limit` now derives from the native
 * `Promotion.limit` field (`derive-voucher-config-cache-fields.ts`), which
 * needs no Campaign relation at all. Read-only — no compensation.
 */
export const loadPromotionForAttachStepId = "load-promotion-for-attach";

export interface LoadPromotionForAttachInput {
  promotion_id: string;
}

export const loadPromotionForAttachStep = createStep(
  loadPromotionForAttachStepId,
  async (input: LoadPromotionForAttachInput, { container }) => {
    const promotionService: IPromotionModuleService = container.resolve(
      Modules.PROMOTION,
    );

    let promotion;
    try {
      promotion = await promotionService.retrievePromotion(input.promotion_id, {
        relations: ["application_method", "campaign"],
      });
    } catch {
      promotion = undefined;
    }

    if (!promotion) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Promotion '${input.promotion_id}' not found`,
      );
    }

    return new StepResponse(promotion);
  },
  // Read-only step — no compensation.
);

export default loadPromotionForAttachStep;
