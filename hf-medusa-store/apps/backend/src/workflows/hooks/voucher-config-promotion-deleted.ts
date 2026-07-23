import { StepResponse } from "@medusajs/framework/workflows-sdk";
import { deletePromotionsWorkflow } from "@medusajs/core-flows";
import { VOUCHER_ENGINE_MODULE } from "../../modules/voucher-engine";

/**
 * Admin unified model — mirrors `voucher-config-promotion-created.ts` for the
 * opposite direction. `deletePromotionsWorkflow` fires this hook after EVERY
 * Promotion deletion, including the native `DELETE /admin/promotions/:id`
 * route (`@medusajs/medusa`'s own admin API — the only route a merchant can
 * reach from the Promotions list/detail page, since VoucherEngine folded its
 * own admin UI into that native page, see `admin/widgets/promotion-detail-
 * voucher-config-widget.tsx`).
 *
 * Before this hook existed, deleting a Promotion left its linked
 * `VoucherConfig` row completely untouched: `voucher_config.promotion_id` is
 * a plain `model.text()` column behind a `readOnly: true` Link
 * (`links/voucher-config-promotion.ts`), so Medusa's Promotion module has no
 * FK back to it and no cascade ever runs. The voucher stayed fully
 * redeemable — `steps/lookup-voucher.ts`'s V1 check only reads
 * `VoucherConfig.is_active` (untouched by a Promotion delete), and its
 * `resolveVoucherNativeFields` overlay silently swallows the now-NOT_FOUND
 * `retrievePromotion` call and falls back to the row's own stale cached
 * fields — so from a merchant's perspective "deleting the promotion" gave no
 * actual protection at all.
 *
 * Deactivates rather than deletes the `VoucherConfig` row, reusing the exact
 * same idempotent semantics as the existing "Disable VoucherEngine" action
 * (`admin/steps/disable-linked-voucher-config.ts`): never touches
 * `VoucherUsageLog` history or analytics (`GET /admin/vouchers/:id/analytics`
 * reads `VoucherConfig` by id and would 404 if the row were hard-deleted).
 * This is the same closing action a merchant could otherwise take manually
 * via Disable — this hook only guarantees it always happens, since a deleted
 * Promotion can no longer be navigated to in order to click that button.
 *
 * Batched over every id in the same delete call (native bulk delete support);
 * an id with no linked, still-enabled `VoucherConfig` (ephemeral cart
 * promotions, non-voucher Promotions, already-disabled vouchers) is a safe
 * no-op.
 */
deletePromotionsWorkflow.hooks.promotionsDeleted(
  async ({ ids }, { container }) => {
    const service: any = container.resolve(VOUCHER_ENGINE_MODULE);

    const linked = await service.listVoucherConfigs({
      promotion_id: ids,
      is_active: true,
    });

    if (!linked.length) {
      return new StepResponse(null, null);
    }

    const disabledIds: string[] = linked.map(
      (voucher: { id: string }) => voucher.id,
    );
    // One call per row (matches every other call site's shape in this
    // module — `disable-linked-voucher-config.ts`, `upsert-linked-voucher-
    // config.ts` — none pass an array; kept consistent rather than assuming
    // bulk-array update semantics).
    await Promise.all(
      disabledIds.map((id) =>
        service.updateVoucherConfigs({ id, is_active: false }),
      ),
    );

    return new StepResponse(null, { disabledIds });
  },
  async (compensationData, { container }) => {
    if (!compensationData) return;
    const service: any = container.resolve(VOUCHER_ENGINE_MODULE);
    await Promise.all(
      compensationData.disabledIds.map((id: string) =>
        service.updateVoucherConfigs({ id, is_active: true }),
      ),
    );
  },
);
