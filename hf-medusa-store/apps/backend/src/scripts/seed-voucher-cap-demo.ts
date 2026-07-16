import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

/**
 * Seeds ONE generic Medusa item-level Promotion so the CONFLICT-8/PD-15
 * fail-closed stacking guard (`verify-cart-totals.ts`, SPEC §18/§19/§23.4) can
 * be demoed live — run with:
 *   npx medusa exec ./src/scripts/seed-voucher-cap-demo.ts
 *
 * WHY: no seed script anywhere creates a generic Promotion (see
 * .claude/lessons/voucher-engine/2026-07-15-no-item-promotion-seed-data-blocks-stacking-cap-live-verification.md).
 * Without one, `item_promotion_discount` is always 0 and neither the 50% cap
 * nor the stacking-rejection path can be exercised outside unit tests. This
 * seed exists ONLY to unblock that live demo — it is not a merchant-configured
 * promotion and isn't meant to be relied on beyond the Day 6 demo/evidence pass.
 *
 * Percentage + item-level + automatic ⇒ any cart containing the scoped
 * product gets this promotion for free (no code entry needed in the
 * storefront). Applying ANY VoucherEngine voucher on top is then expected to
 * be rejected 400 `VOUCHER_STACKING_UNSUPPORTED` (fail-closed by design, not a
 * bug — see the lesson above and the Day-5 Slice 2 progress notes).
 *
 * Idempotent: deletes its own prior promotion (by code) before recreating.
 */

const DEMO_PROMOTION_CODE = "DEMO-CAP-CONFLICT-40";
const DEMO_PRODUCT_HANDLE = "yonex-bg65-3pack"; // exists in the badminton catalog seed (plain "yonex-bg65" is soft-deleted)

export default async function seedVoucherCapDemo({ container }: ExecArgs) {
  const logger = container.resolve("logger");
  const productModule = container.resolve(Modules.PRODUCT);
  const promotionModule: any = container.resolve(Modules.PROMOTION);

  const [product] = await productModule.listProducts(
    { handle: DEMO_PRODUCT_HANDLE },
    { select: ["id", "handle"] },
  );
  if (!product) {
    logger.warn(
      `[seed:voucher-cap-demo] product "${DEMO_PRODUCT_HANDLE}" not found — run the catalog seed first. Aborting.`,
    );
    return;
  }

  // Idempotent: remove any prior run's promotion by code.
  const existing = await promotionModule.listPromotions(
    { code: DEMO_PROMOTION_CODE },
    { select: ["id"] },
  );
  if (existing.length) {
    await promotionModule.deletePromotions(existing.map((p: any) => p.id));
    logger.info(
      `[seed:voucher-cap-demo] removed ${existing.length} prior demo promotion(s).`,
    );
  }

  await promotionModule.createPromotions({
    code: DEMO_PROMOTION_CODE,
    type: "standard",
    status: "active",
    is_automatic: true, // applies without any code entry in the storefront
    application_method: {
      type: "percentage",
      target_type: "items",
      allocation: "across",
      value: 40, // 40% off — high enough to trip the stacking-rejection with ANY voucher
      currency_code: "vnd",
      target_rules: [
        {
          attribute: "items.product_id",
          operator: "eq",
          values: [product.id],
        },
      ],
    },
  });

  logger.info(
    `[seed:voucher-cap-demo] created automatic 40% item promotion "${DEMO_PROMOTION_CODE}" scoped to product "${DEMO_PRODUCT_HANDLE}". Add this product to a cart, then apply any voucher (SAVE10/MEGA20/SHUTTLE20) — expect 400 VOUCHER_STACKING_UNSUPPORTED.`,
  );
}
