import { ExecArgs } from "@medusajs/framework/types";
import { Modules } from "@medusajs/framework/utils";

/**
 * Seeds ONE generic Medusa item-level Promotion so the VOUCH-003 stacking +
 * global-cap rule (`calculate-discount.ts`, SPEC §18/§19/§23.4) can be
 * demoed live — run with:
 *   npx medusa exec ./src/scripts/seed-voucher-cap-demo.ts
 * (chained automatically by `migration-scripts/initial-data-seed.ts`, so a
 * fresh `npx medusa db:migrate` creates it too — see ONBOARDING.md §4.)
 *
 * WHY: no other seed script creates a generic item-level Promotion (see
 * .claude/lessons/voucher-engine/2026-07-15-no-item-promotion-seed-data-blocks-stacking-cap-live-verification.md).
 * Without one, `item_promotion_discount` is always 0 and neither Rule 1
 * (item-promo-first) nor the 50% global cap (Rule 6) can be exercised
 * outside unit tests. This seed exists ONLY to unblock that live demo — it
 * is not a merchant-configured promotion.
 *
 * Percentage + item-level + automatic ⇒ any cart containing the scoped
 * product gets this promotion for free (no code entry needed in the
 * storefront). Applying a VoucherEngine voucher on top now (Decision H, the
 * credit-line carrier) succeeds and coexists correctly per Rule 1+2 — the
 * item promo is untouched and the voucher computes on the post-promotion
 * subtotal, capped at 50% of the ORIGINAL subtotal if the combined discount
 * would exceed it (`discount_capped: true`). This docstring previously
 * (incorrectly, pre-Decision-H) described a 400 `VOUCHER_STACKING_UNSUPPORTED`
 * rejection — that fail-closed guard is now a defensive, should-be-unreachable
 * invariant (see the Day-5 Slice 2 progress notes), not the expected outcome.
 *
 * Idempotent: deletes its own prior promotion (by code) before recreating.
 */

const DEMO_PROMOTION_CODE = "DEMO-CAP-CONFLICT-40";
// "yonex-bg65" — a real product from the tracked catalog seed
// (`migration-scripts/initial-data-seed.ts`), so this script works on any
// fresh DB, not just one that's been hand-edited. It's also the
// SuggestiveSelling Tier-1 "Best Match" suggestion for both Astrox rackets
// (`seed-suggestive-selling.ts`), so the demo naturally covers VOUCH-003's
// own stated integration point: "item gợi ý (cũng có thể có promo riêng)".
const DEMO_PRODUCT_HANDLE = "yonex-bg65";

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
          // Dot-path form ("items.product.id") — the same attribute key the
          // Admin Dashboard itself writes when a merchant adds a "Product"
          // condition via "What items will the promotion be applied to?"
          // (verified against the installed @medusajs/dashboard bundle).
          // Using it here means this rule renders in that section instead
          // of showing "No records" while the rule is functionally silent
          // to the UI (both forms are resolved identically by computeActions,
          // confirmed live: BG65 gets its 40% adjustment either way).
          attribute: "items.product.id",
          operator: "eq",
          values: [product.id],
        },
      ],
    },
  });

  logger.info(
    `[seed:voucher-cap-demo] created automatic 40% item promotion "${DEMO_PROMOTION_CODE}" scoped to product "${DEMO_PRODUCT_HANDLE}". Add this product to a cart, then apply any voucher (SAVE10/MEGA20/SHUTTLE20) — expect it to succeed, capped at 50% of the original subtotal (discount_capped: true) per Rule 6.`,
  );
}
