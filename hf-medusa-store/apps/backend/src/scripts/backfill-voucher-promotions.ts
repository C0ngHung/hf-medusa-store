import { ExecArgs, MedusaContainer } from "@medusajs/framework/types";
import { createPromotionsWorkflow } from "@medusajs/core-flows";
import { VOUCHER_ENGINE_MODULE } from "../modules/voucher-engine";
import { buildBackingPromotion } from "../workflows/voucher-engine/admin/lib/build-backing-promotion";
import type { CreateVoucherStepInput } from "../workflows/voucher-engine/admin/steps/create-voucher";

/**
 * Backfill the canonical backing Medusa Promotion + Campaign for VoucherConfig
 * rows created BEFORE Phase 2 (SPEC Decision C/H) — i.e. rows whose
 * `promotion_id` is still null. Run with:
 *   npx medusa exec ./src/scripts/backfill-voucher-promotions.ts
 *
 * IDEMPOTENT: only vouchers with a null `promotion_id` are provisioned; rows
 * that already have a backing Promotion are skipped, so re-running is a no-op
 * (never creates a duplicate-code Promotion). The shared
 * `provisionMissingBackingPromotions` is reused by the voucher seed so seeded
 * demo vouchers also get backing records.
 *
 * The backing Promotion is NEVER attached to a cart (Decision H — the discount
 * rides a `cart.credit_lines` entry); it exists for admin/analytics visibility.
 */
export async function provisionMissingBackingPromotions(
  container: MedusaContainer,
): Promise<{ provisioned: number; skipped: number }> {
  const logger = container.resolve("logger");
  const ve: any = container.resolve(VOUCHER_ENGINE_MODULE);

  const configs = await ve.listVoucherConfigs(
    {},
    {
      select: [
        "id",
        "code",
        "promotion_id",
        "discount_type",
        "discount_value",
        "min_order_value",
        "max_discount_amount",
        "applicable_product_ids",
        "applicable_category_ids",
        "per_user_limit",
        "usage_limit",
        "valid_from",
        "valid_to",
        "is_active",
      ],
      take: 10000,
    },
  );

  let provisioned = 0;
  let skipped = 0;

  for (const c of configs) {
    if (c.promotion_id) {
      skipped++;
      continue;
    }

    const input: CreateVoucherStepInput = {
      code: c.code,
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      min_order_value: c.min_order_value,
      max_discount_amount: c.max_discount_amount,
      applicable_product_ids: c.applicable_product_ids,
      applicable_category_ids: c.applicable_category_ids,
      per_user_limit: c.per_user_limit,
      usage_limit: c.usage_limit,
      // DB values may deserialize as strings — normalize to Date for the campaign window.
      valid_from: new Date(c.valid_from),
      valid_to: new Date(c.valid_to),
      is_active: c.is_active,
    };

    const { result } = await createPromotionsWorkflow(container).run({
      input: { promotionsData: buildBackingPromotion(input, c.code) },
    });
    const promo: any = result[0];

    await ve.updateVoucherConfigs({
      id: c.id,
      promotion_id: promo.id,
      campaign_id: promo.campaign_id ?? promo.campaign?.id ?? null,
    });
    provisioned++;
  }

  logger.info(
    `[backfill:voucher] backing promotions — provisioned ${provisioned}, skipped ${skipped} (already had one).`,
  );
  return { provisioned, skipped };
}

export default async function backfillVoucherPromotions({
  container,
}: ExecArgs) {
  await provisionMissingBackingPromotions(container);
}
