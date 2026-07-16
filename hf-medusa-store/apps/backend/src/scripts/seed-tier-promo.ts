import { Modules } from "@medusajs/framework/utils";
import type { ExecArgs } from "@medusajs/framework/types";

/**
 * Seed the EC-08 demo promotion tier: a native Medusa **automatic** Promotion
 * "spend 5,000,000₫ → 5% off order". This is NOT a voucher (no code — it applies
 * automatically once the cart subtotal crosses the threshold) and NOT part of
 * SuggestiveSelling. It exists so EC-08 can be demoed end-to-end: adding a
 * suggested item pushes the cart past 5M → this tier auto-applies as an
 * item-level promotion → the voucher (if any) recalculates on the new post-promo
 * subtotal → global 50% cap re-checked (VOUCH-003 / SRS §8 EC-08).
 *
 * The threshold is expressed as a promotion rule on `item_total` (the cart
 * subtotal). NOTE: the Admin create-wizard does NOT expose `item_total` in its
 * "Who can use this code?" dropdown, so this tier can only be configured via the
 * Promotion module API (this script) — verified live: fires at ≥ 5,000,000,
 * stays off below it.
 *
 * Idempotent: re-running replaces the existing TIER5M5 promotion.
 * Run: `npx medusa exec ./src/scripts/seed-tier-promo.ts`
 */
const TIER_CODE = "TIER5M5";
const THRESHOLD_VND = 5_000_000;
const PERCENT_OFF = 5;
const CURRENCY = "vnd";

export default async function ({ container }: ExecArgs) {
  const logger = container.resolve("logger");
  const promotionModule: any = container.resolve(Modules.PROMOTION);

  const existing = await promotionModule.listPromotions(
    { code: TIER_CODE },
    { select: ["id"] },
  );
  if (existing.length) {
    await promotionModule.deletePromotions(existing.map((p: any) => p.id));
  }

  await promotionModule.createPromotions({
    code: TIER_CODE,
    type: "standard",
    status: "active",
    is_automatic: true, // no code — auto-applies when the rule matches
    application_method: {
      type: "percentage",
      target_type: "order", // % off the whole order
      value: PERCENT_OFF,
      currency_code: CURRENCY,
    },
    rules: [
      // Cart subtotal ≥ 5,000,000₫ (integer VND, INT-01). Attribute `item_total`
      // is the pre-discount cart subtotal.
      {
        attribute: "item_total",
        operator: "gte",
        values: [String(THRESHOLD_VND)],
      },
    ],
  });

  logger.info(
    `[seed:tier] ${TIER_CODE} — automatic ${PERCENT_OFF}% off order when item_total >= ${THRESHOLD_VND.toLocaleString("vi-VN")}₫ (EC-08).`,
  );
}
