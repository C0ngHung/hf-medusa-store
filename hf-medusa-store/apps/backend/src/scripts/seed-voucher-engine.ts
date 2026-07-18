import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";
import { VOUCHER_ENGINE_MODULE } from "../modules/voucher-engine";
import { DEFAULT_CAP_PCT } from "../modules/voucher-engine/constants";
import { provisionMissingBackingPromotions } from "./backfill-voucher-promotions";

/**
 * Seed for the VoucherEngine module — run with:
 *   npx medusa exec ./src/scripts/seed-voucher-engine.ts
 *
 * Idempotent: clears its own rows before inserting. SHUTTLE20 resolves the
 * "Shuttlecocks" category by name, so this must run AFTER the catalog seed
 * (missing category → SHUTTLE20 is seeded unscoped with a warning).
 *
 * Money = integer VND (INT-01). `discount_value` for percentage vouchers is in
 * BASIS-POINTS (1000 = 10%, 2000 = 20%); the global cap is 5000 = 50%.
 *
 * Each seeded voucher is provisioned with its canonical backing Medusa
 * Promotion + Campaign (SPEC Decision C/H, Phase 2) via the shared
 * `provisionMissingBackingPromotions` — the same path the admin create workflow
 * uses. The backing Promotion is never cart-attached (the discount rides a
 * `cart.credit_lines` entry).
 *
 * Also seeds ONE generic (non-VoucherEngine) Medusa Promotion, `RACKET2M`, for
 * manual UI testing of generic-promotion + voucher coexistence and the 50% cap.
 * NOTE: under the credit-line carrier (Decision H) a coexisting PERCENTAGE item
 * promotion is now FULLY SUPPORTED (the voucher credit line never enters
 * `computeActions`, so it cannot shrink the item promotion — the CONFLICT-8/
 * PD-15 fix). `RACKET2M` is kept `fixed`/`items`/`across` only for a stable,
 * predictable manual-test amount; percentage generic promotions also work now.
 */

// Codes are stored UPPERCASE (see workflows/voucher-engine/lib/normalize).
const VOUCHERS = [
  {
    // Simple 10% off, no scope, no minimum — happy-path fixture.
    code: "SAVE10",
    discount_type: "percentage" as const,
    discount_value: 1000,
    min_order_value: null as number | null,
    max_discount_amount: null as number | null,
    category_scope: null as string | null,
  },
  {
    // 20% off, unscoped — used to exercise the 50% global cap (Day 4).
    code: "MEGA20",
    discount_type: "percentage" as const,
    discount_value: 2000,
    min_order_value: null,
    max_discount_amount: null,
    category_scope: null,
  },
  {
    // 20% off shuttlecocks only, min order 200,000₫ — scope + V5 fixture.
    code: "SHUTTLE20",
    discount_type: "percentage" as const,
    discount_value: 2000,
    min_order_value: 200000,
    max_discount_amount: null,
    category_scope: "Shuttlecocks",
  },
];

export default async function seedVoucherEngine({ container }: ExecArgs) {
  const logger = container.resolve("logger");
  const productModule = container.resolve(Modules.PRODUCT);
  const ve: any = container.resolve(VOUCHER_ENGINE_MODULE);

  // Resolve category ids by name (match in memory, same idiom as suggestive seed).
  const categories = await productModule.listProductCategories(
    {},
    { select: ["id", "name"], take: 1000 },
  );
  const catIdByName = new Map(categories.map((c: any) => [c.name, c.id]));

  const validFrom = new Date();
  const validTo = new Date(validFrom);
  validTo.setFullYear(validTo.getFullYear() + 1);

  const rows = VOUCHERS.map((v) => {
    let applicable_category_ids: string[] | null = null;
    if (v.category_scope) {
      const catId = catIdByName.get(v.category_scope);
      if (catId) {
        applicable_category_ids = [catId];
      } else {
        logger.warn(
          `[seed:voucher] category "${v.category_scope}" not found — ${v.code} seeded unscoped (run catalog seed first)`,
        );
      }
    }
    return {
      code: v.code,
      discount_type: v.discount_type,
      discount_value: v.discount_value,
      min_order_value: v.min_order_value,
      max_discount_amount: v.max_discount_amount,
      applicable_product_ids: null,
      applicable_category_ids,
      stackable_with_promotions: true,
      per_user_limit: 1,
      usage_limit: null,
      usage_count: 0,
      user_segment_conditions: null,
      valid_from: validFrom,
      valid_to: validTo,
      is_active: true,
    };
  });

  // Idempotent wipe + insert (vouchers). Also delete each voucher's backing
  // Promotion + Campaign (Decision C/H) so re-seeding never collides on the
  // unique Promotion code. Delete promotions before campaigns (the promotion
  // references the campaign).
  const promotionModule: any = container.resolve(Modules.PROMOTION);
  const existing = await ve.listVoucherConfigs(
    {},
    { select: ["id", "promotion_id", "campaign_id"] },
  );
  if (existing.length) {
    const promoIds = existing
      .map((r: any) => r.promotion_id)
      .filter(Boolean) as string[];
    const campaignIds = existing
      .map((r: any) => r.campaign_id)
      .filter(Boolean) as string[];
    if (promoIds.length) await promotionModule.deletePromotions(promoIds);
    if (campaignIds.length) await promotionModule.deleteCampaigns(campaignIds);
    await ve.deleteVoucherConfigs(existing.map((r: any) => r.id));
  }
  await ve.createVoucherConfigs(rows);
  logger.info(
    `[seed:voucher] created ${rows.length} vouchers: ${rows.map((r) => r.code).join(", ")}.`,
  );

  // Provision each seeded voucher's canonical backing Promotion + Campaign
  // (Decision C/H, Phase 2) — same path as the admin create workflow.
  await provisionMissingBackingPromotions(container);

  // Idempotent wipe + insert (global discount cap singleton, 50%).
  const existingCap = await ve.listDiscountCapConfigs({}, { select: ["id"] });
  if (existingCap.length) {
    await ve.deleteDiscountCapConfigs(existingCap.map((r: any) => r.id));
  }
  await ve.createDiscountCapConfigs({
    max_discount_percentage: DEFAULT_CAP_PCT,
    is_active: true,
    updated_by: "seed",
  });
  logger.info(
    `[seed:voucher] created global discount cap = ${DEFAULT_CAP_PCT} bp (50%).`,
  );

  // Idempotent wipe + insert (one generic Medusa Promotion for manual UI
  // testing — coexistence with a voucher, and the 50% cap on a smaller cart;
  // see the module header note on `fixed` vs `percentage`). Reuses the
  // `promotionModule` resolved above.
  const existingPromo = await promotionModule.listPromotions(
    { code: "RACKET2M" },
    { select: ["id"] },
  );
  if (existingPromo.length) {
    await promotionModule.deletePromotions(existingPromo.map((p: any) => p.id));
  }
  await promotionModule.createPromotions({
    code: "RACKET2M",
    type: "standard",
    status: "active",
    is_automatic: false,
    application_method: {
      type: "fixed",
      target_type: "items",
      allocation: "across",
      value: 2_000_000,
      currency_code: "vnd",
    },
  });
  logger.info(
    "[seed:voucher] created generic promotion RACKET2M (2,000,000₫ off, fixed/items/across).",
  );
}
