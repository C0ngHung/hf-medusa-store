import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";
import { Modules } from "@medusajs/framework/utils";
import type { IPromotionModuleService } from "@medusajs/framework/types";
import { VOUCHER_ENGINE_MODULE } from "../../../../modules/voucher-engine";

/**
 * disableLinkedVoucherConfigStep — "Disable VoucherEngine" (Admin unified
 * model). Sets `VoucherConfig.is_active = false` on the row linked to this
 * Promotion — never deletes the Promotion, the VoucherConfig row, its
 * `VoucherUsageLog` history, or analytics. Idempotent:
 *
 *   - No linked VoucherConfig at all -> no-op success (nothing to disable).
 *   - Already disabled -> no-op success (returns it unchanged).
 *   - Enabled -> sets `is_active: false`.
 *
 * Once disabled, `steps/lookup-voucher.ts`'s V1 check
 * (`voucher.is_active`) rejects this code at the cart-code endpoint exactly
 * like a nonexistent code (Admin unified model, cart-code behavior
 * requirement).
 *
 * Also flips the linked Promotion's own `status` to `"inactive"` (bug-bash
 * finding, 2026-07-21): `build-promotion-input.ts` gives the canonical
 * Promotion the SAME `code` as the voucher, so before this fix, disabling
 * VoucherEngine left that Promotion fully `status:"active"` — a customer
 * re-entering the exact same code hit `VOUCHER_NOT_FOUND` at VoucherEngine's
 * own endpoint (correctly, per V1), but the storefront's generic-promotion
 * fallback (`discount-code/index.tsx`'s `applyGenericCode`) would then find
 * and apply that STILL-ACTIVE canonical Promotion directly — a real discount,
 * completely bypassing V1-V8 (no per-user-limit/cap check, no usage_count
 * increment, no audit log row). Setting `status:"inactive"` here makes
 * `getActionsToComputeFromPromotionsStep` (Medusa core) compute zero actions
 * for it, so the fallback's own membership check (`applyGenericCode`'s
 * `cart.promotions.some(...)`, added in the same bug-bash pass) correctly
 * reports it as not applied instead of silently succeeding. This never
 * affects VoucherEngine's OWN redemption path
 * (`workflows/voucher-engine/apply-voucher.ts`): that path computes the
 * discount itself and carries it via a freshly-created, always-active
 * EPHEMERAL Promotion — it never reads the canonical Promotion's `status`.
 */
export const disableLinkedVoucherConfigStepId = "disable-linked-voucher-config";

export interface DisableLinkedVoucherConfigInput {
  promotion_id: string;
}

export interface DisableLinkedVoucherConfigOutput {
  voucher: Record<string, any> | null;
  /** true only when this call actually flipped is_active true -> false —
   * false for the idempotent no-op cases (nothing linked, or already
   * disabled). Lets callers (e.g. the admin feed notification) distinguish
   * a real Disable action from a redundant repeat call. */
  didDisable: boolean;
}

type CompensationData = {
  voucherConfigId: string;
  promotionId: string;
  previousPromotionStatus: string;
} | null;

export const disableLinkedVoucherConfigStep = createStep(
  disableLinkedVoucherConfigStepId,
  async (input: DisableLinkedVoucherConfigInput, { container }) => {
    const service: any = container.resolve(VOUCHER_ENGINE_MODULE);

    const [existing] = await service.listVoucherConfigs(
      { promotion_id: input.promotion_id },
      { take: 1 },
    );

    if (!existing || !existing.is_active) {
      // Idempotent no-op: nothing linked, or already disabled.
      const compensation: CompensationData = null;
      const output: DisableLinkedVoucherConfigOutput = {
        voucher: existing ?? null,
        didDisable: false,
      };
      return new StepResponse(output, compensation);
    }

    const promotionService: IPromotionModuleService = container.resolve(
      Modules.PROMOTION,
    );
    const promotion = await promotionService.retrievePromotion(
      input.promotion_id,
    );

    const voucher = await service.updateVoucherConfigs({
      id: existing.id,
      is_active: false,
    });
    if (promotion.status !== "inactive") {
      await promotionService.updatePromotions({
        id: input.promotion_id,
        status: "inactive",
      });
    }

    const compensation: CompensationData = {
      voucherConfigId: existing.id,
      promotionId: input.promotion_id,
      previousPromotionStatus: promotion.status ?? "active",
    };
    const output: DisableLinkedVoucherConfigOutput = {
      voucher,
      didDisable: true,
    };
    return new StepResponse(output, compensation);
  },
  async (compensationData: CompensationData | undefined, { container }) => {
    if (!compensationData) return;
    const service: any = container.resolve(VOUCHER_ENGINE_MODULE);
    await service.updateVoucherConfigs({
      id: compensationData.voucherConfigId,
      is_active: true,
    });

    const promotionService: IPromotionModuleService = container.resolve(
      Modules.PROMOTION,
    );
    await promotionService.updatePromotions({
      id: compensationData.promotionId,
      status: compensationData.previousPromotionStatus as any,
    });
  },
);

export default disableLinkedVoucherConfigStep;
