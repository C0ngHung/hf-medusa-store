import { ExecArgs, MedusaContainer } from "@medusajs/framework/types";
import type { UpdatePromotionDTO } from "@medusajs/framework/types";
import { updatePromotionsWorkflow } from "@medusajs/core-flows";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { VOUCHER_ENGINE_MODULE } from "../modules/voucher-engine";

/**
 * `UpdatePromotionDTO` (installed `@medusajs/types@2.16.0`) omits `metadata`
 * even though the Promotion module accepts and persists it at runtime (the
 * same write shape `create-voucher.ts`'s attach-mode guardrail already uses
 * via `updatePromotionsWorkflow.runAsStep`, which sidesteps this gap only
 * because `transform()`'s inferred return type isn't checked against the
 * DTO). A type-only widening, not `any` — every other field stays checked.
 */
type UpdatePromotionWithMetadataDTO = UpdatePromotionDTO & {
  metadata?: Record<string, unknown> | null;
};

/**
 * Backfill `metadata.voucher_engine=true` onto the backing Promotion of
 * VoucherConfig rows whose Promotion predates the metadata-stamp guardrail
 * (commit 1472a43, "stamp voucher_engine metadata on backing promotion").
 * SAVE10/MEGA20/SHUTTLE20 got their backing Promotion provisioned by
 * `provisionMissingBackingPromotions` (backfill-voucher-promotions.ts)
 * BEFORE that guardrail existed, so it was never stamped. Without the
 * stamp, `block-voucher-promotion.ts`'s native-route guardrail cannot
 * recognize them as vouchers — a customer could apply their code via the
 * native `/store/carts/:id/promotions` route, skipping V1-V8/rate-limit/
 * audit and risking the Rule-11 stacking bug Decision H's credit-line
 * carrier exists to prevent. Run with:
 *   npx medusa exec ./src/scripts/backfill-voucher-metadata.ts
 *
 * IDEMPOTENT: only Promotions whose `metadata.voucher_engine` is not
 * already `true` are updated (existing metadata keys are preserved,
 * matching the guardrail write in create-voucher.ts); re-running is a no-op.
 */
export async function backfillVoucherMetadata(
  container: MedusaContainer,
): Promise<{ stamped: number; skipped: number }> {
  const logger = container.resolve("logger");
  const ve: any = container.resolve(VOUCHER_ENGINE_MODULE);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const configs = await ve.listVoucherConfigs(
    {},
    { select: ["id", "code", "promotion_id"], take: 10000 },
  );

  let stamped = 0;
  let skipped = 0;

  for (const c of configs) {
    if (!c.promotion_id) {
      skipped++;
      continue;
    }

    const { data: [promotion] = [] } = (await query.graph({
      entity: "promotion",
      filters: { id: c.promotion_id },
      fields: ["metadata"],
    })) as { data: { metadata?: Record<string, unknown> | null }[] };

    if (promotion?.metadata?.voucher_engine === true) {
      skipped++;
      continue;
    }

    const promotionsData: UpdatePromotionWithMetadataDTO[] = [
      {
        id: c.promotion_id,
        metadata: { ...(promotion?.metadata ?? {}), voucher_engine: true },
      },
    ];
    await updatePromotionsWorkflow(container).run({
      input: { promotionsData: promotionsData as UpdatePromotionDTO[] },
    });
    stamped++;
    logger.info(
      `[backfill:voucher-metadata] stamped ${c.code} (${c.promotion_id})`,
    );
  }

  logger.info(
    `[backfill:voucher-metadata] metadata.voucher_engine — stamped ${stamped}, skipped ${skipped} (already stamped or no backing promotion).`,
  );
  return { stamped, skipped };
}

export default async function backfillVoucherMetadataScript({
  container,
}: ExecArgs) {
  await backfillVoucherMetadata(container);
}
