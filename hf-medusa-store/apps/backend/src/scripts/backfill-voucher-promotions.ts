import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { createPromotionsWorkflow } from "@medusajs/core-flows";
import { VOUCHER_ENGINE_MODULE } from "../modules/voucher-engine";
import { buildPromotionData } from "../workflows/voucher-engine/admin/lib/build-promotion-input";

/**
 * Rebuild Phase 1 backfill (SRS §5.2 "VoucherConfig extends Promotion") — run:
 *   npx medusa exec ./src/scripts/backfill-voucher-promotions.ts
 *
 * For every `voucher_config` row with `promotion_id IS NULL`, creates a
 * matching canonical Promotion(+Campaign) and sets the link, so no voucher
 * is left unlinked after Phase 1 ships. Idempotent: re-running only touches
 * rows still missing a `promotion_id` — already-linked rows are skipped.
 *
 * Crash-safe re-run (medusa-module-reviewer finding, Phase 1): creating the
 * Promotion and updating `voucher_config.promotion_id` are two separate
 * operations. If the process dies in between, a naive re-run would try to
 * create ANOTHER Promotion with the same `code` and fail forever on the
 * unique-code constraint. This script looks up an existing Promotion by code
 * FIRST and reuses it if found, only creating when truly absent — so a
 * resumed run reconciles instead of re-attempting a doomed create.
 *
 * Does NOT pass `additional_data.voucher_config` to `createPromotionsWorkflow`
 * — these `VoucherConfig` rows already exist (unlike the admin create path,
 * where the `promotionsCreated` hook provisions a NEW row). Passing it here
 * would make the hook attempt a duplicate `createVoucherConfigs` call for the
 * same code, violating the unique index on `code`. Instead this script
 * updates the existing row's `promotion_id` directly after the Promotion is
 * found or created.
 */
export default async function backfillVoucherPromotions({
  container,
}: ExecArgs) {
  const logger = container.resolve("logger");
  const service: any = container.resolve(VOUCHER_ENGINE_MODULE);
  const promotionService: any = container.resolve(Modules.PROMOTION);

  const unlinked = await service.listVoucherConfigs({ promotion_id: null });

  if (!unlinked.length) {
    logger.info(
      "[backfill-voucher-promotions] Nothing to backfill — every voucher_config row already has a promotion_id.",
    );
    return;
  }

  logger.info(
    `[backfill-voucher-promotions] Backfilling ${unlinked.length} voucher_config row(s)...`,
  );

  for (const voucher of unlinked) {
    const promotionData = buildPromotionData(voucher);

    const [existingPromotion] = await promotionService.listPromotions(
      { code: promotionData.code },
      { take: 1 },
    );

    let promotionId: string;
    if (existingPromotion) {
      // A prior run already created the Promotion but crashed before the
      // voucher_config update below — reuse it instead of re-creating.
      promotionId = existingPromotion.id;
      logger.info(
        `[backfill-voucher-promotions] ${voucher.code} — reusing existing promotion ${promotionId} (resumed run)`,
      );
    } else {
      const { result: promotions } = await createPromotionsWorkflow(
        container,
      ).run({
        input: { promotionsData: [promotionData] },
      });
      promotionId = promotions[0].id;
    }

    await service.updateVoucherConfigs({
      id: voucher.id,
      promotion_id: promotionId,
    });

    logger.info(
      `[backfill-voucher-promotions] ${voucher.code} -> promotion ${promotionId}`,
    );
  }

  logger.info("[backfill-voucher-promotions] Done.");
}
