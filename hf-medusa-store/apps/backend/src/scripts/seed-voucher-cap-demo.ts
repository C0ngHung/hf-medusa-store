import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

/**
 * Seeds ONE generic Medusa automatic item-level Promotion so the SRS
 * stacking/cap calculation (item promotion + Voucher, `calculate-discount.ts`,
 * SPEC §10) can be demoed live against a real cart — run with:
 *   npx medusa exec ./src/scripts/seed-voucher-cap-demo.ts
 *
 * WHY: no seed script anywhere creates a generic Promotion (see
 * .claude/lessons/voucher-engine/2026-07-15-no-item-promotion-seed-data-blocks-stacking-cap-live-verification.md).
 * Without one, `item_promotion_discount` is always 0 and the 50% global cap
 * can't be exercised outside unit tests. This seed exists ONLY to unblock
 * that live demo — it is not a merchant-configured promotion and isn't meant
 * to be relied on beyond a manual/demo pass.
 *
 * **2026-07-20 update (Decision-4 carrier rewrite):** applying a voucher on
 * top of this automatic promotion is no longer rejected. It used to be —
 * the old ephemeral-Promotion carrier could shrink this Promotion's own
 * adjustment (CONFLICT-8/PD-15, `VOUCHER_STACKING_UNSUPPORTED`) because it
 * was itself a Promotion competing in Medusa's `computeActions` recompute.
 * The current carrier (raw `LineItemAdjustment`s, `code: null`) is invisible
 * to that recompute, so this Promotion's own 40% discount is preserved
 * exactly and the Voucher applies afterward on the post-promotion subtotal,
 * matching the SRS's worked example almost exactly (40% item promotion vs.
 * the SRS's 39.57%-equivalent cap-exceeded example, §10 / this project's
 * decision-4 SRS worked examples).
 *
 * Percentage + item-level + automatic ⇒ any cart containing the scoped
 * product gets this promotion for free (no code entry needed in the
 * storefront).
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
      value: 40, // 40% off — high enough to exercise the global 50% cap alongside a voucher
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
    `[seed:voucher-cap-demo] created automatic 40% item promotion "${DEMO_PROMOTION_CODE}" scoped to product "${DEMO_PRODUCT_HANDLE}". Add this product to a cart, then apply any voucher (SAVE10/MEGA20/SHUTTLE20) — expect success: the 40% item discount is preserved, the voucher applies on the post-promotion subtotal, and the combined discount is capped at 50% of the original subtotal if it would otherwise exceed that.`,
  );
}
