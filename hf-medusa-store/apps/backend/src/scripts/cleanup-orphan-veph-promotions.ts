import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { deletePromotionsWorkflow } from "@medusajs/core-flows";

/**
 * One-off dev cleanup: delete orphaned ephemeral voucher promotions (code
 * prefix `VEPH-`) left over from the PRE-Option-B architecture, where applying
 * a voucher created + cart-attached an ephemeral fixed Promotion (Rule-11
 * violation). Option B (Decision H) replaced that carrier with a
 * `cart.credit_lines` entry, so no new `VEPH-*` promotions are ever created.
 * These stale rows only pollute the admin Promotions list.
 *
 * Run with:  npx medusa exec ./src/scripts/cleanup-orphan-veph-promotions.ts
 *
 * SAFE / IDEMPOTENT: only promotions whose code starts with `VEPH-` are
 * removed. Backing promotions for real vouchers (SAVE10, SHUTTLE20, MEGA20,
 * …) and any other promotion are untouched. Re-running is a no-op once the
 * VEPH rows are gone.
 */
export default async function cleanupOrphanVephPromotions({
  container,
}: ExecArgs) {
  const logger = container.resolve("logger");
  const promotionService: any = container.resolve(Modules.PROMOTION);

  const veph = await promotionService.listPromotions(
    { code: { $like: "VEPH-%" } },
    { select: ["id", "code"], take: 10000 },
  );

  if (!veph.length) {
    logger.info("[cleanup-veph] No orphaned VEPH-* promotions found. No-op.");
    return;
  }

  logger.info(
    `[cleanup-veph] Deleting ${veph.length} orphaned VEPH-* promotion(s): ` +
      veph.map((p: any) => p.code).join(", "),
  );

  await deletePromotionsWorkflow(container).run({
    input: { ids: veph.map((p: any) => p.id) },
  });

  logger.info(`[cleanup-veph] Done. Removed ${veph.length} promotion(s).`);
}
