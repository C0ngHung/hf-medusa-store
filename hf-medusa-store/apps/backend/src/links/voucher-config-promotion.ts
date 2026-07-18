import { defineLink } from "@medusajs/framework/utils";
import PromotionModule from "@medusajs/medusa/promotion";
import VoucherEngineModule from "../modules/voucher-engine";

/**
 * Read-only link: VoucherConfig.promotion_id → Promotion.id (SPEC §6, Decision
 * C/H).
 *
 * VoucherConfig already stores the canonical backing Promotion's id (provisioned
 * by the admin create workflow, Phase 2), so we declare a read-only link on that
 * existing text field instead of a pivot table — modules stay decoupled (no
 * cross-module DB FK) while Query can fetch the linked Promotion graph
 * (`voucher_config.promotion.*` — native `limit`/`used`, campaign window) in one
 * shot for admin/analytics. The Promotion is never cart-attached (Decision H);
 * this link is reference-only. No extra migration/table is created.
 */
export default defineLink(
  {
    linkable: VoucherEngineModule.linkable.voucherConfig,
    field: "promotion_id",
  },
  PromotionModule.linkable.promotion,
  {
    readOnly: true,
  },
);
